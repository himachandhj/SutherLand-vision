from __future__ import annotations

from io import BytesIO
from pathlib import PurePosixPath
from typing import Any
from zipfile import BadZipFile, ZipFile

from app.core.config import settings
from app.core.database import (
    complete_dataset_audit,
    create_dataset_audit,
    get_dataset,
    get_fine_tuning_session,
    update_dataset_audit_summary,
    update_fine_tuning_session,
)
from app.core.minio_integration import (
    MinioConnectionConfig,
    create_client,
    normalize_prefix,
    validate_bucket_access,
)
from app.services.fine_tuning import SUPPORTED_MEDIA_EXTENSIONS
from app.services.labeling_service import get_label_state


SUPPORTED_IMPORT_EXTENSIONS = {".zip"}
LABEL_IMPORT_FOLDER = "_imported_labels"


def _minio_config_for_dataset(dataset: dict[str, Any]) -> MinioConnectionConfig:
    return MinioConnectionConfig(
        endpoint=settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        bucket=str(dataset.get("minio_bucket") or settings.minio_bucket),
        input_prefix=str(dataset.get("minio_prefix") or settings.minio_input_prefix),
        output_prefix=settings.minio_output_prefix,
        secure=settings.minio_secure,
    ).normalized()


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
    if dataset.get("usecase_slug") != session.get("usecase_slug"):
        raise ValueError("Selected dataset does not belong to this fine-tuning use case.")
    if dataset.get("source_type") != "minio":
        raise ValueError("Label import is currently supported only for MinIO-backed datasets.")
    return session, dataset


def _list_media_stems(client: Any, bucket: str, prefix: str) -> tuple[set[str], int]:
    media_stems: set[str] = set()
    media_count = 0
    for obj in client.list_objects(bucket, prefix=prefix, recursive=True):
        if getattr(obj, "is_dir", False):
            continue
        object_name = str(obj.object_name)
        path = PurePosixPath(object_name)
        if path.suffix.lower() not in SUPPORTED_MEDIA_EXTENSIONS:
            continue
        media_count += 1
        media_stems.add(path.stem)
    return media_stems, media_count


def _validate_yolo_line(line: str, *, file_name: str, line_number: int) -> str | None:
    stripped = line.strip()
    if not stripped:
        return None
    parts = stripped.split()
    if len(parts) != 5:
        return f"{file_name}:{line_number} is not YOLO format. Expected: class x_center y_center width height."
    try:
        class_id = int(float(parts[0]))
        coordinates = [float(value) for value in parts[1:]]
    except ValueError:
        return f"{file_name}:{line_number} contains non-numeric YOLO values."
    if class_id < 0:
        return f"{file_name}:{line_number} has a negative class id."
    if any(value < 0 or value > 1 for value in coordinates):
        return f"{file_name}:{line_number} has coordinates outside the normalized 0-1 range."
    return None


def _extract_yolo_zip(upload_bytes: bytes) -> list[dict[str, Any]]:
    try:
        with ZipFile(BytesIO(upload_bytes)) as archive:
            names = [name for name in archive.namelist() if not name.endswith("/")]
            label_names = [
                name
                for name in names
                if PurePosixPath(name).suffix.lower() == ".txt" and not PurePosixPath(name).name.startswith(".")
            ]
            if not label_names:
                raise ValueError("No YOLO .txt label files were found inside the zip.")

            labels: list[dict[str, Any]] = []
            validation_errors: list[str] = []
            for name in label_names:
                data = archive.read(name)
                if len(data) == 0:
                    # Empty YOLO files are allowed, but they are treated as no-object labels.
                    text = ""
                else:
                    try:
                        text = data.decode("utf-8")
                    except UnicodeDecodeError:
                        validation_errors.append(f"{name} is not valid UTF-8 text.")
                        continue

                for index, line in enumerate(text.splitlines(), start=1):
                    error = _validate_yolo_line(line, file_name=name, line_number=index)
                    if error:
                        validation_errors.append(error)

                labels.append(
                    {
                        "archive_name": name,
                        "file_name": PurePosixPath(name).name,
                        "stem": PurePosixPath(name).stem,
                        "bytes": data,
                        "object_count": len([line for line in text.splitlines() if line.strip()]),
                    }
                )

            if validation_errors:
                raise ValueError("; ".join(validation_errors[:5]))
            return labels
    except BadZipFile as error:
        raise ValueError("Invalid zip file. Upload a .zip containing YOLO .txt label files.") from error


def _readiness_status(score: int) -> str:
    if score >= 85:
        return "ready"
    if score >= 70:
        return "mostly_ready"
    if score >= 50:
        return "needs_cleanup"
    return "not_ready"


def import_yolo_labels_for_session(session_id: int, *, filename: str, content: bytes) -> dict[str, Any]:
    suffix = PurePosixPath(filename or "").suffix.lower()
    if suffix not in SUPPORTED_IMPORT_EXTENSIONS:
        raise ValueError("Unsupported label import type. This phase supports YOLO .zip exports only.")
    if not content:
        raise ValueError("Uploaded label export is empty.")

    session, dataset = _session_and_selected_dataset(session_id)
    config = _minio_config_for_dataset(dataset)
    client = create_client(config)
    validate_bucket_access(client, config.bucket)

    labels = _extract_yolo_zip(content)
    media_stems, media_count = _list_media_stems(client, config.bucket, config.input_prefix)
    if media_count <= 0:
        raise ValueError("No supported dataset images or videos were found for the selected MinIO prefix.")

    matched_labels = [label for label in labels if label["stem"] in media_stems]
    unmatched_labels = [label for label in labels if label["stem"] not in media_stems]
    if not matched_labels:
        raise ValueError("No imported label filenames matched the selected dataset media filenames.")

    duplicate_stems = sorted({label["stem"] for label in matched_labels if sum(1 for item in matched_labels if item["stem"] == label["stem"]) > 1})
    import_prefix = normalize_prefix(f"{config.input_prefix.rstrip('/')}/{LABEL_IMPORT_FOLDER}", "")
    for label in matched_labels:
        object_key = f"{import_prefix}{label['file_name']}"
        client.put_object(
            config.bucket,
            object_key,
            BytesIO(label["bytes"]),
            length=len(label["bytes"]),
            content_type="text/plain",
        )

    coverage = len({label["stem"] for label in matched_labels}) / max(media_count, 1)
    label_status = "ready" if coverage >= 0.8 else "partial"
    readiness_score = 90 if label_status == "ready" else 72
    warnings: list[dict[str, str]] = []
    recommendations: list[dict[str, str]] = []
    if unmatched_labels:
        warnings.append(
            {
                "code": "unmatched_label_files",
                "message": f"{len(unmatched_labels)} label file(s) did not match dataset media filenames.",
                "severity": "medium",
            }
        )
        recommendations.append(
            {
                "code": "review_unmatched_labels",
                "message": "Check that YOLO label filenames match image/video stems in the selected dataset.",
            }
        )
    if label_status == "partial":
        warnings.append(
            {
                "code": "partial_label_coverage",
                "message": f"Labels cover {round(coverage * 100)}% of selected dataset media.",
                "severity": "medium",
            }
        )
        recommendations.append(
            {
                "code": "add_missing_labels",
                "message": "Add label files for the remaining media before training for best results.",
            }
        )
    if duplicate_stems:
        warnings.append(
            {
                "code": "duplicate_label_stems",
                "message": f"{len(duplicate_stems)} duplicate label filename stem(s) were detected in the import.",
                "severity": "medium",
            }
        )

    summary = {
        "bucket_accessible": True,
        "prefix_exists": True,
        "bucket": config.bucket,
        "prefix": config.input_prefix,
        "imported_filename": filename,
        "import_format": "yolo_zip",
        "file_count": media_count,
        "supported_file_count": media_count,
        "label_file_count": len(matched_labels),
        "matched_label_count": len(matched_labels),
        "unmatched_label_count": len(unmatched_labels),
        "label_coverage": round(coverage, 4),
        "label_status": label_status,
        "readiness_status": _readiness_status(readiness_score),
    }

    audit = create_dataset_audit(dataset_id=int(dataset["id"]), session_id=int(session["id"]), status="running")
    completed_audit = complete_dataset_audit(
        int(audit["id"]),
        status=_readiness_status(readiness_score),
        readiness_score=readiness_score,
        issues=warnings,
        recommendations=recommendations,
        summary=summary,
    )
    updated_dataset = update_dataset_audit_summary(
        int(dataset["id"]),
        file_count=media_count,
        label_status=label_status,
        audit_status=str(completed_audit["status"]),
    )
    update_fine_tuning_session(
        int(session["id"]),
        current_step=max(int(session.get("current_step") or 1), 3),
        readiness_score=readiness_score,
        recommended_next_action=(
            "Imported labels validated. Prepare the dataset handoff when ready."
            if label_status == "ready"
            else "Imported labels are partial. Review coverage before training setup."
        ),
    )

    return {
        "session_id": int(session["id"]),
        "dataset_id": int(updated_dataset["id"]),
        "import_status": "validated",
        "import_format": "yolo_zip",
        "filename": filename,
        "label_status": label_status,
        "label_count": len(matched_labels),
        "matched_label_count": len(matched_labels),
        "unmatched_label_count": len(unmatched_labels),
        "coverage": round(coverage, 4),
        "warnings": warnings,
        "summary": summary,
        "audit": completed_audit,
        "label_state": get_label_state(int(session["id"])),
    }
