from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from io import BytesIO
from pathlib import PurePosixPath
from typing import Any

from app.core.config import settings
from app.core.database import (
    get_dataset,
    get_fine_tuning_session,
    get_latest_dataset_audit_for_dataset,
    update_dataset_label_status,
    update_fine_tuning_session,
    upsert_fine_tuning_dataset_version,
)
from app.core.minio_integration import (
    MinioConnectionConfig,
    create_client,
    normalize_prefix,
    validate_bucket_access,
)
from app.schemas.fine_tuning import FineTuningDatasetReadyPayload
from app.services.dataset_label_status import compute_label_status, normalize_label_status
from app.services.fine_tuning import LABEL_EXTENSIONS, SUPPORTED_MEDIA_EXTENSIONS


SCHEMA_VERSION = "v1"
MANIFEST_PREFIX = "fine_tuning/manifests"

TASK_TYPE_BY_USE_CASE = {
    "fire-detection": "object_detection",
    "ppe-detection": "object_detection",
    "region-alerts": "object_detection",
    "crack-detection": "object_detection",
    "unsafe-behavior-detection": "object_detection",
    "class-wise-counting": "object_detection",
    "class-wise-object-counting": "object_detection",
    "speed-estimation": "tracking",
    "queue-management": "tracking",
    "object-tracking": "object_detection",
}

ANNOTATION_FORMATS = {"yolo", "coco", "classification", "unknown"}
LABEL_REQUIRED_TASK_TYPES = {"object_detection"}
OBJECT_TRACKING_HANDOFF_GUIDANCE = "Prepared dataset fine-tunes the detector used by Object Tracking. Tracking logic is configured separately."


def _model_dump(model: FineTuningDatasetReadyPayload) -> dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()


def _normalize_label_status(label_status: str | None) -> str:
    return normalize_label_status(label_status)


def _minio_config_for_dataset(dataset: dict[str, Any]) -> MinioConnectionConfig:
    return MinioConnectionConfig(
        endpoint=settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        bucket=str(dataset.get("minio_bucket") or settings.minio_bucket),
        input_prefix=str(dataset.get("minio_prefix") or ""),
        output_prefix=settings.minio_output_prefix,
        secure=settings.minio_secure,
    ).normalized()


def _prepared_dataset_uri(dataset: dict[str, Any]) -> str:
    bucket = str(dataset.get("minio_bucket") or settings.minio_bucket).strip()
    prefix = normalize_prefix(str(dataset.get("minio_prefix") or ""), "").strip("/")
    if not bucket:
        raise ValueError("Selected dataset is missing a MinIO bucket.")
    return f"minio://{bucket}/{prefix}" if prefix else f"minio://{bucket}"


def _relative_key(object_key: str, prefix: str) -> str:
    normalized_prefix = normalize_prefix(prefix, "")
    if normalized_prefix and object_key.startswith(normalized_prefix):
        return object_key[len(normalized_prefix):]
    return PurePosixPath(object_key).name


def _object_metadata(obj: Any, prefix: str) -> dict[str, Any]:
    object_key = str(obj.object_name)
    last_modified = getattr(obj, "last_modified", None)
    return {
        "object_key": object_key,
        "relative_key": _relative_key(object_key, prefix),
        "size": int(getattr(obj, "size", 0) or 0),
        "etag": str(getattr(obj, "etag", "") or ""),
        "last_modified": last_modified.isoformat() if last_modified else None,
        "suffix": PurePosixPath(object_key).suffix.lower(),
    }


def _list_dataset_objects(dataset: dict[str, Any]) -> tuple[Any | None, list[dict[str, Any]], str | None]:
    config = _minio_config_for_dataset(dataset)
    try:
        client = create_client(config)
        validate_bucket_access(client, config.bucket)
        objects = [
            _object_metadata(obj, config.input_prefix)
            for obj in client.list_objects(config.bucket, prefix=config.input_prefix, recursive=True)
            if not getattr(obj, "is_dir", False)
        ]
        return client, sorted(objects, key=lambda item: item["object_key"]), None
    except Exception as error:
        return None, [], str(error)


def _is_media(item: dict[str, Any]) -> bool:
    return str(item.get("suffix") or "").lower() in SUPPORTED_MEDIA_EXTENSIONS


def _is_label(item: dict[str, Any]) -> bool:
    return str(item.get("suffix") or "").lower() in LABEL_EXTENSIONS


def _looks_classification_like(media_items: list[dict[str, Any]]) -> bool:
    class_dirs = set()
    for item in media_items:
        parent = PurePosixPath(str(item.get("relative_key") or "")).parent
        if str(parent) not in {"", "."}:
            class_dirs.add(parent.parts[0])
    return len(class_dirs) >= 2


def _detect_annotation_format(label_items: list[dict[str, Any]], media_items: list[dict[str, Any]]) -> str:
    suffixes = {str(item.get("suffix") or "").lower() for item in label_items}
    if ".txt" in suffixes:
        return "yolo"
    json_labels = [
        str(item.get("relative_key") or "").lower()
        for item in label_items
        if str(item.get("suffix") or "").lower() == ".json"
    ]
    if any("coco" in name or "annotation" in name or "instances" in name for name in json_labels):
        return "coco"
    if not label_items and _looks_classification_like(media_items):
        return "classification"
    return "unknown"


def _read_object_bytes(client: Any, bucket: str, object_key: str) -> bytes:
    response = client.get_object(bucket, object_key)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def _valid_yolo_line_count(text: str) -> int:
    count = 0
    for line in text.splitlines():
        parts = line.strip().split()
        if len(parts) != 5:
            continue
        try:
            class_id = int(float(parts[0]))
            x_center = float(parts[1])
            y_center = float(parts[2])
            width = float(parts[3])
            height = float(parts[4])
        except ValueError:
            continue
        if class_id < 0:
            continue
        if any(value < 0 or value > 1 for value in [x_center, y_center, width, height]):
            continue
        if width <= 0 or height <= 0:
            continue
        count += 1
    return count


def _valid_label_stems(
    client: Any | None,
    bucket: str,
    label_items: list[dict[str, Any]],
    media_items: list[dict[str, Any]],
) -> set[str]:
    if client is None:
        return set()

    media_stems = {PurePosixPath(str(item.get("object_key") or "")).stem for item in media_items}
    valid_stems: set[str] = set()
    for item in label_items:
        if str(item.get("suffix") or "").lower() != ".txt":
            continue
        object_key = str(item.get("object_key") or "")
        stem = PurePosixPath(object_key).stem
        if stem not in media_stems:
            continue
        try:
            text = _read_object_bytes(client, bucket, object_key).decode("utf-8")
        except Exception:
            continue
        if _valid_yolo_line_count(text) <= 0:
            continue
        valid_stems.add(stem)
    return valid_stems


def _task_type(usecase_slug: str) -> str:
    return TASK_TYPE_BY_USE_CASE.get(usecase_slug, "unknown")


def _handoff_guidance(usecase_slug: str) -> str | None:
    if usecase_slug == "object-tracking":
        return OBJECT_TRACKING_HANDOFF_GUIDANCE
    return None


def _split_summary(item_count: int) -> dict[str, int]:
    # Step 4 can replace this with a real split planner. For now the handoff
    # stays honest: no split artifacts exist yet, so all selected items are train.
    return {"train": int(item_count), "val": 0, "test": 0}


def _readiness_score(session: dict[str, Any], audit: dict[str, Any] | None, item_count: int, label_status: str) -> int:
    if audit and audit.get("readiness_score") is not None:
        return int(audit["readiness_score"])
    if item_count <= 0:
        return 0
    if label_status == "ready":
        return 75
    if label_status == "partial":
        return 60
    if label_status == "missing":
        return 35
    return 50


def _fingerprint_source(
    *,
    dataset: dict[str, Any],
    supported_items: list[dict[str, Any]],
    list_error: str | None,
) -> list[dict[str, Any]]:
    if supported_items:
        return [
            {
                "relative_key": item["relative_key"],
                "size": item["size"],
                "etag": item["etag"],
                "last_modified": item["last_modified"],
            }
            for item in supported_items
        ]
    return [
        {
            "dataset_id": int(dataset["id"]),
            "bucket": dataset.get("minio_bucket"),
            "prefix": dataset.get("minio_prefix"),
            "list_error": list_error,
        }
    ]


def _data_fingerprint(dataset: dict[str, Any], supported_items: list[dict[str, Any]], list_error: str | None) -> str:
    source = _fingerprint_source(dataset=dataset, supported_items=supported_items, list_error=list_error)
    metadata_blob = json.dumps(source, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(metadata_blob).hexdigest()


def _dataset_version_id(dataset_id: int, fingerprint: str) -> str:
    return f"dsv_{dataset_id}_{fingerprint[:12]}"


def _status(label_status: str, warnings: list[str], blocking_issues: list[str]) -> str:
    if blocking_issues or label_status == "missing":
        return "blocked"
    if label_status in {"partial", "unknown"} or warnings:
        return "ready_with_warnings"
    return "ready_for_training"


def _build_warning_and_blocking_issues(
    *,
    item_count: int,
    label_count: int,
    label_status: str,
    annotation_format: str,
    task_type: str,
    list_error: str | None,
    class_distribution: dict[str, int],
) -> tuple[list[str], list[str]]:
    warnings: list[str] = []
    blocking_issues: list[str] = []

    if list_error:
        blocking_issues.append(f"invalid_minio_prefix: {list_error}")
    if item_count <= 0:
        blocking_issues.append("no_supported_files")
    if label_status == "missing":
        blocking_issues.append("missing_labels")
    elif label_status == "partial":
        warnings.append("partial_labels")
    elif label_status == "unknown":
        warnings.append("label_status_unknown")
    if annotation_format == "unknown":
        warnings.append("unknown_annotation_format")
    if task_type == "unknown":
        warnings.append("unknown_task_type")
    if item_count and item_count < 20:
        warnings.append("low_file_count")
    if label_count <= 0:
        warnings.append("no_label_files_detected")
        if task_type in LABEL_REQUIRED_TASK_TYPES and "missing_labels" not in blocking_issues:
            blocking_issues.append("missing_labels")
    if not class_distribution:
        warnings.append("class_distribution_unavailable")

    return warnings, blocking_issues


def _manifest_uri(bucket: str, manifest_key: str) -> str:
    return f"minio://{bucket}/{manifest_key}"


def _put_manifest(client: Any, bucket: str, manifest_key: str, manifest: dict[str, Any]) -> None:
    manifest_bytes = json.dumps(manifest, indent=2, sort_keys=True).encode("utf-8")
    client.put_object(
        bucket,
        manifest_key,
        BytesIO(manifest_bytes),
        length=len(manifest_bytes),
        content_type="application/json",
    )


def _session_and_selected_dataset(session_id: int) -> tuple[dict[str, Any], dict[str, Any]]:
    session = get_fine_tuning_session(session_id)
    if not session:
        raise ValueError("Fine-tuning session not found.")
    dataset_id = session.get("selected_dataset_id")
    if not dataset_id:
        raise ValueError("No dataset is selected for this fine-tuning session.")
    dataset = get_dataset(int(dataset_id))
    if not dataset:
        raise ValueError("Selected dataset not found.")
    if dataset["usecase_slug"] != session["usecase_slug"]:
        raise ValueError("Selected dataset does not belong to this fine-tuning use case.")
    if dataset.get("source_type") != "minio":
        raise ValueError("Only MinIO-backed datasets can be prepared for the training handoff.")
    return session, dataset


def build_finalized_dataset_ready_payload(session_id: int) -> dict[str, Any]:
    session, dataset = _session_and_selected_dataset(session_id)
    audit = get_latest_dataset_audit_for_dataset(dataset_id=int(dataset["id"]), session_id=session_id)
    if audit is None:
        audit = get_latest_dataset_audit_for_dataset(dataset_id=int(dataset["id"]))

    client, objects, list_error = _list_dataset_objects(dataset)
    media_items = [item for item in objects if _is_media(item)]
    label_items = [item for item in objects if _is_label(item)]
    supported_items = sorted([*media_items, *label_items], key=lambda item: item["object_key"])
    annotation_format = _detect_annotation_format(label_items, media_items)
    usecase_slug = str(session["usecase_slug"])
    task_type = _task_type(usecase_slug)
    handoff_guidance = _handoff_guidance(usecase_slug)
    item_count = len(media_items)
    valid_label_stems = _valid_label_stems(client, str(dataset.get("minio_bucket") or settings.minio_bucket), label_items, media_items)
    label_count = len(valid_label_stems)
    label_status = compute_label_status(item_count, label_count)
    if label_status != _normalize_label_status(dataset.get("label_status")):
        dataset = update_dataset_label_status(int(dataset["id"]), label_status=label_status)
    readiness_score = _readiness_score(session, audit, item_count, label_status)
    class_distribution: dict[str, int] = {}
    split_summary = _split_summary(item_count)
    fingerprint = _data_fingerprint(dataset, supported_items, list_error)
    dataset_version_id = _dataset_version_id(int(dataset["id"]), fingerprint)
    prepared_dataset_uri = _prepared_dataset_uri(dataset)
    manifest_bucket = str(dataset.get("minio_bucket") or settings.minio_bucket).strip()
    manifest_key = f"{MANIFEST_PREFIX}/{dataset_version_id}.json"
    prepared_dataset_manifest_uri = _manifest_uri(manifest_bucket, manifest_key)

    warnings, blocking_issues = _build_warning_and_blocking_issues(
        item_count=item_count,
        label_count=label_count,
        label_status=label_status,
        annotation_format=annotation_format,
        task_type=task_type,
        list_error=list_error,
        class_distribution=class_distribution,
    )
    status = _status(label_status, warnings, blocking_issues)

    generated_at = datetime.now(timezone.utc).isoformat()
    manifest = {
        "workspace_id": f"fine-tuning-session-{session_id}",
        "dataset_id": str(dataset["id"]),
        "dataset_version_id": dataset_version_id,
        "use_case_id": str(session["usecase_slug"]),
        "dataset_name": str(dataset["name"]),
        "minio": {
            "bucket": dataset.get("minio_bucket"),
            "prefix": dataset.get("minio_prefix"),
        },
        "supported_files": supported_items,
        "item_count": item_count,
        "label_count": label_count,
        "annotation_format": annotation_format,
        "task_type": task_type,
        "split_summary": split_summary,
        "class_distribution": class_distribution,
        "label_status": label_status,
        "readiness_score": readiness_score,
        "warnings": warnings,
        "blocking_issues": blocking_issues,
        "schema_version": SCHEMA_VERSION,
        "data_fingerprint": fingerprint,
        "status": status,
        "generated_at": generated_at,
    }
    if handoff_guidance:
        manifest["handoff_guidance"] = handoff_guidance

    if client is None:
        blocking_issues.append("manifest_generation_failed: MinIO client is unavailable.")
    else:
        try:
            _put_manifest(client, manifest_bucket, manifest_key, manifest)
        except Exception as error:
            blocking_issues.append(f"manifest_generation_failed: {error}")

    status = _status(label_status, warnings, blocking_issues)
    payload_model = FineTuningDatasetReadyPayload(
        workspace_id=f"fine-tuning-session-{session_id}",
        dataset_id=str(dataset["id"]),
        dataset_version_id=dataset_version_id,
        use_case_id=str(session["usecase_slug"]),
        dataset_name=str(dataset["name"]),
        label_status=label_status,
        readiness_score=readiness_score,
        prepared_dataset_uri=prepared_dataset_uri,
        prepared_dataset_manifest_uri=prepared_dataset_manifest_uri,
        annotation_format=annotation_format if annotation_format in ANNOTATION_FORMATS else "unknown",
        task_type=task_type,
        split_summary=split_summary,
        class_distribution=class_distribution,
        item_count=item_count,
        label_count=label_count,
        warnings=warnings,
        blocking_issues=blocking_issues,
        schema_version=SCHEMA_VERSION,
        data_fingerprint=fingerprint,
        status=status,
    )
    payload = _model_dump(payload_model)
    if handoff_guidance:
        payload["handoff_guidance"] = handoff_guidance

    # Store enough immutable metadata for Step 4 to refer back to this exact
    # content version. This is intentionally lightweight, not a DVC-style layer.
    upsert_fine_tuning_dataset_version(
        dataset_id=int(dataset["id"]),
        dataset_version_id=dataset_version_id,
        session_id=int(session["id"]),
        data_fingerprint=fingerprint,
        manifest_uri=prepared_dataset_manifest_uri,
        prepared_dataset_uri=prepared_dataset_uri,
        annotation_format=annotation_format,
        task_type=task_type,
        item_count=item_count,
        label_count=label_count,
        readiness_score=readiness_score,
        label_status=label_status,
        status=status,
        schema_version=SCHEMA_VERSION,
        payload=payload,
    )

    recommended_next_action = (
        "Dataset version is frozen and ready for training setup."
        if status == "ready_for_training"
        else "Review the dataset handoff warnings or blockers before training setup."
    )
    if handoff_guidance:
        recommended_next_action = f"{handoff_guidance} {recommended_next_action}"

    update_fine_tuning_session(
        int(session["id"]),
        current_step=max(int(session.get("current_step") or 1), 3),
        recommended_next_action=recommended_next_action,
    )

    return payload
