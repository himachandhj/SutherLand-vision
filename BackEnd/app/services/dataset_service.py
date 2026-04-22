from __future__ import annotations

from pathlib import PurePosixPath
from typing import Any

from app.core.config import settings
from app.core.database import (
    create_dataset,
    get_dataset,
    get_fine_tuning_session,
    get_latest_dataset_audit_for_dataset,
    list_datasets_for_usecase,
    update_dataset_audit_summary,
    update_fine_tuning_session,
)
from app.core.minio_integration import (
    MinioConnectionConfig,
    create_client,
    normalize_prefix,
    validate_bucket_access,
)
from app.services.dataset_label_status import compute_label_status, label_coverage, normalize_label_status, resolve_label_status
from app.services.fine_tuning import LABEL_EXTENSIONS, SUPPORTED_MEDIA_EXTENSIONS


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
VIDEO_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".webm"}
VALID_MEDIA_TYPES = {"image", "video", "mixed", "unknown"}
COMPLETED_AUDIT_STATUSES = {"ready", "mostly_ready", "needs_cleanup", "not_ready"}


def _payload_to_dict(payload: Any) -> dict[str, Any]:
    if hasattr(payload, "model_dump"):
        return payload.model_dump()
    if isinstance(payload, dict):
        return payload
    return dict(payload)


def _get_session_or_raise(session_id: int) -> dict[str, Any]:
    session = get_fine_tuning_session(session_id)
    if not session:
        raise ValueError("Fine-tuning session not found.")
    return session


def _normalize_label_status(status: str | None) -> str:
    return normalize_label_status(status)


def _normalize_audit_status(status: str | None) -> str:
    value = (status or "not_run").strip().lower()
    if value in COMPLETED_AUDIT_STATUSES:
        return "completed"
    if value in {"not_run", "running", "completed", "failed"}:
        return value
    return "not_run"


def _minio_config(bucket: str, prefix: str) -> MinioConnectionConfig:
    return MinioConnectionConfig(
        endpoint=settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        bucket=bucket,
        input_prefix=prefix,
        output_prefix=settings.minio_output_prefix,
        secure=settings.minio_secure,
    ).normalized()


def _infer_media_type(object_names: list[str], requested_media_type: str | None = None) -> str:
    requested = (requested_media_type or "").strip().lower()
    if requested in VALID_MEDIA_TYPES and requested != "unknown":
        return requested

    has_images = False
    has_videos = False
    for object_name in object_names:
        suffix = PurePosixPath(object_name).suffix.lower()
        if suffix in IMAGE_EXTENSIONS:
            has_images = True
        elif suffix in VIDEO_EXTENSIONS:
            has_videos = True

    if has_images and has_videos:
        return "mixed"
    if has_images:
        return "image"
    if has_videos:
        return "video"
    return "unknown"


def _validate_minio_dataset(bucket: str, prefix: str, requested_media_type: str | None = None) -> dict[str, Any]:
    config = _minio_config(bucket, prefix)
    client = create_client(config)
    validate_bucket_access(client, config.bucket)

    objects = [
        obj
        for obj in client.list_objects(config.bucket, prefix=config.input_prefix, recursive=True)
        if not getattr(obj, "is_dir", False)
    ]
    object_names = [str(obj.object_name) for obj in objects]
    media_objects = [
        obj
        for obj in objects
        if PurePosixPath(str(obj.object_name)).suffix.lower() in SUPPORTED_MEDIA_EXTENSIONS
    ]
    label_objects = [
        obj
        for obj in objects
        if PurePosixPath(str(obj.object_name)).suffix.lower() in LABEL_EXTENSIONS
    ]
    unsupported_objects = [
        obj
        for obj in objects
        if PurePosixPath(str(obj.object_name)).suffix.lower()
        not in SUPPORTED_MEDIA_EXTENSIONS.union(LABEL_EXTENSIONS)
    ]

    warnings: list[str] = []
    if not objects:
        warnings.append("No objects were found under this MinIO prefix.")
    elif not media_objects:
        warnings.append("Objects were found, but no supported image or video files were detected.")
    if media_objects and not label_objects:
        warnings.append("Supported media files were found, but no label files were detected yet.")
    if unsupported_objects:
        warnings.append(f"{len(unsupported_objects)} unsupported files were ignored while registering this dataset.")

    label_status = compute_label_status(len(media_objects), len(label_objects))

    return {
        "bucket_accessible": True,
        "prefix_exists": bool(objects),
        "bucket": config.bucket,
        "prefix": config.input_prefix,
        "file_count": len(media_objects),
        "total_objects": len(objects),
        "label_file_count": len(label_objects),
        "label_coverage": round(label_coverage(len(media_objects), len(label_objects)), 4),
        "unsupported_file_count": len(unsupported_objects),
        "label_status": label_status,
        "media_type": _infer_media_type(object_names, requested_media_type),
        "warnings": warnings,
    }


def _dataset_summary(dataset: dict[str, Any], selected_dataset_id: int | None = None) -> dict[str, Any]:
    latest_audit = get_latest_dataset_audit_for_dataset(dataset_id=int(dataset["id"]))
    audit_summary = latest_audit.get("summary_json", {}) if latest_audit else {}
    label_count = audit_summary.get("label_file_count") if isinstance(audit_summary, dict) else None
    item_count = audit_summary.get("file_count") if isinstance(audit_summary, dict) else None
    label_status = resolve_label_status(dataset.get("label_status"), item_count=item_count, label_count=label_count)
    return {
        "dataset_id": int(dataset["id"]),
        "name": dataset["name"],
        "source_type": dataset["source_type"],
        "media_type": dataset.get("media_type") or "unknown",
        "file_count": int(dataset.get("file_count") or 0),
        "label_status": label_status,
        "audit_status": _normalize_audit_status(dataset.get("audit_status")),
        "readiness_status": latest_audit.get("status") if latest_audit else None,
        "readiness_score": latest_audit.get("readiness_score") if latest_audit else None,
        "minio_bucket": dataset.get("minio_bucket"),
        "minio_prefix": dataset.get("minio_prefix"),
        "is_selected": selected_dataset_id == int(dataset["id"]),
        "created_at": dataset.get("created_at"),
    }


def _refresh_minio_dataset_state(dataset: dict[str, Any]) -> dict[str, Any]:
    if dataset.get("source_type") != "minio":
        return dataset
    try:
        validation = _validate_minio_dataset(
            str(dataset.get("minio_bucket") or settings.minio_bucket),
            str(dataset.get("minio_prefix") or ""),
            dataset.get("media_type"),
        )
    except Exception:
        return dataset

    file_count = int(validation["file_count"])
    label_status = str(validation["label_status"])
    if file_count == int(dataset.get("file_count") or 0) and label_status == _normalize_label_status(dataset.get("label_status")):
        return dataset

    return update_dataset_audit_summary(
        int(dataset["id"]),
        file_count=file_count,
        label_status=label_status,
        audit_status=str(dataset.get("audit_status") or "not_run"),
    )


def _session_state(session: dict[str, Any]) -> dict[str, Any]:
    return {
        "session_id": int(session["id"]),
        "usecase_slug": session["usecase_slug"],
        "current_step": int(session.get("current_step") or 1),
        "selected_dataset_id": session.get("selected_dataset_id"),
        "status": session.get("status"),
        "updated_at": session.get("updated_at"),
    }


def list_datasets_for_session(session_id: int) -> dict[str, Any]:
    session = _get_session_or_raise(session_id)
    selected_dataset_id = int(session["selected_dataset_id"]) if session.get("selected_dataset_id") else None
    datasets = [_refresh_minio_dataset_state(dataset) for dataset in list_datasets_for_usecase(str(session["usecase_slug"]))]
    return {
        **_session_state(session),
        "datasets": [_dataset_summary(dataset, selected_dataset_id) for dataset in datasets],
    }


def register_dataset_for_session(session_id: int, payload: Any) -> dict[str, Any]:
    session = _get_session_or_raise(session_id)
    data = _payload_to_dict(payload)
    source_type = str(data.get("source_type") or "minio").strip().lower()
    if source_type != "minio":
        raise ValueError("Only MinIO-backed datasets are supported in Step 2.")

    name = str(data.get("name") or "").strip()
    if not name:
        raise ValueError("Dataset name is required.")

    bucket = str(data.get("minio_bucket") or settings.minio_bucket).strip()
    prefix = normalize_prefix(str(data.get("minio_prefix") or ""), "")
    if not bucket:
        raise ValueError("MinIO bucket is required.")

    try:
        validation = _validate_minio_dataset(bucket, prefix, data.get("media_type"))
    except Exception as error:
        raise ValueError(f"Unable to validate MinIO dataset: {error}") from error

    dataset = create_dataset(
        usecase_slug=str(session["usecase_slug"]),
        name=name,
        source_type=source_type,
        minio_bucket=bucket,
        minio_prefix=str(validation["prefix"]),
        media_type=str(validation["media_type"]),
        file_count=int(validation["file_count"]),
        label_status=str(validation["label_status"]),
        audit_status="not_run",
    )

    updated_session = session
    if bool(data.get("auto_select", True)):
        updated_session = update_fine_tuning_session(
            int(session["id"]),
            selected_dataset_id=int(dataset["id"]),
            readiness_score=None,
            recommended_next_action="Run data check for the selected dataset before continuing.",
        )

    selected_dataset_id = int(updated_session["selected_dataset_id"]) if updated_session.get("selected_dataset_id") else None
    return {
        **_session_state(updated_session),
        "dataset": _dataset_summary(dataset, selected_dataset_id),
        "validation": validation,
    }


def select_dataset_for_session(session_id: int, dataset_id: int) -> dict[str, Any]:
    session = _get_session_or_raise(session_id)
    dataset = get_dataset(dataset_id)
    if not dataset:
        raise ValueError("Dataset not found.")
    if dataset["usecase_slug"] != session["usecase_slug"]:
        raise ValueError("Dataset does not belong to this fine-tuning use case.")

    updated_session = update_fine_tuning_session(
        session_id,
        selected_dataset_id=dataset_id,
        readiness_score=None,
        recommended_next_action="Run data check for the selected dataset before continuing.",
    )
    return {
        **_session_state(updated_session),
        "selected_dataset": _dataset_summary(dataset, int(updated_session["selected_dataset_id"])),
    }


def get_dataset_detail(session_id: int, dataset_id: int) -> dict[str, Any]:
    session = _get_session_or_raise(session_id)
    dataset = get_dataset(dataset_id)
    if not dataset:
        raise ValueError("Dataset not found.")
    if dataset["usecase_slug"] != session["usecase_slug"]:
        raise ValueError("Dataset does not belong to this fine-tuning use case.")

    selected_dataset_id = int(session["selected_dataset_id"]) if session.get("selected_dataset_id") else None
    latest_audit = get_latest_dataset_audit_for_dataset(dataset_id=dataset_id, session_id=session_id)
    if latest_audit is None:
        latest_audit = get_latest_dataset_audit_for_dataset(dataset_id=dataset_id)

    audit_summary = latest_audit.get("summary_json", {}) if latest_audit else {}
    label_count = int(audit_summary.get("label_file_count") or 0) if isinstance(audit_summary, dict) else 0
    item_count = int(audit_summary.get("file_count") or dataset.get("file_count") or 0) if isinstance(audit_summary, dict) else int(dataset.get("file_count") or 0)
    label_status = resolve_label_status(dataset.get("label_status"), item_count=item_count, label_count=(label_count if latest_audit else None))
    labels_available = label_status in {"ready", "partial"}

    return {
        **_session_state(session),
        "dataset": {
            **_dataset_summary(dataset, selected_dataset_id),
            "updated_at": dataset.get("updated_at"),
            "labels_available": labels_available,
            "latest_audit": (
                {
                    "audit_id": int(latest_audit["id"]),
                    "status": latest_audit["status"],
                    "readiness_score": latest_audit.get("readiness_score"),
                    "issues": latest_audit.get("issues_json", []),
                    "recommendations": latest_audit.get("recommendations_json", []),
                    "summary": latest_audit.get("summary_json", {}),
                    "created_at": latest_audit.get("created_at"),
                    "completed_at": latest_audit.get("completed_at"),
                }
                if latest_audit
                else None
            ),
        },
        # TODO Step 3: replace this light signal with label schema/class coverage checks.
        "label_readiness": label_status,
    }
