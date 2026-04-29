from __future__ import annotations

import base64
import hashlib
import inspect
import json
import shutil
from datetime import datetime
from io import BytesIO
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.request import Request, urlopen

import cv2
import numpy as np

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
    build_presigned_get_url,
    create_client,
    normalize_prefix,
    validate_bucket_access,
)
from app.services.dataset_label_status import compute_label_status, label_coverage
from app.services.fine_tuning import SUPPORTED_MEDIA_EXTENSIONS
from app.services.labeling_service import get_label_state


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
MANUAL_LABEL_FOLDER = "_manual_labels"
AUTO_LABEL_FOLDER = "_auto_labels"
ANNOTATION_META_FOLDER = "_annotation_meta"
DEFAULT_CLASSES_BY_USE_CASE = {
    "ppe-detection": ["person", "helmet", "vest"],
    "fire-detection": ["fire", "smoke"],
    "region-alerts": ["person"],
    "class-wise-object-counting": ["person", "car", "truck", "bus"],
    "class-wise-counting": ["person", "car", "truck", "bus"],
    "object-tracking": ["person", "car", "truck", "bus"],
    "queue-management": ["person"],
    "speed-estimation": ["car", "truck", "bus", "motorcycle"],
}
BACKEND_DIR = Path(__file__).resolve().parents[2]
FIRE_SMOKE_MODEL_DIR = BACKEND_DIR / "models"
FIRE_SMOKE_MODEL_PATH = FIRE_SMOKE_MODEL_DIR / "fire_smoke_best.pt"
YOLO_EXPORTS_DIR = BACKEND_DIR / "exports" / "fine_tuning"
ASSIST_MODEL_DIR = BACKEND_DIR / "models" / "assist"
ASSIST_BASE_MODEL_CANDIDATES = ["yolo11n.pt", "yolov8n.pt"]
FIRE_SMOKE_MODEL_URLS = [
    "https://github.com/luminous0219/fire-and-smoke-detection-yolov8/raw/main/weights/best.pt",
    "https://github.com/Nocluee100/Fire-and-Smoke-Detection-yolov8-v1/raw/main/best.pt",
]
GROUNDING_DINO_MODEL_NAME = "IDEA-Research/grounding-dino-tiny"
SAM_MODEL_NAME = "facebook/sam-vit-base"

_AUTO_LABEL_MODEL: Any | None = None
_AUTO_LABEL_MODEL_SOURCE = ""
_GROUNDING_DINO_MODEL: Any | None = None
_GROUNDING_DINO_PROCESSOR: Any | None = None
_GROUNDING_DINO_MODEL_SOURCE = ""
_GROUNDING_DINO_DEVICE = "cpu"
_SAM_MODEL: Any | None = None
_SAM_PROCESSOR: Any | None = None
_SAM_MODEL_SOURCE = ""
_SAM_DEVICE = "cpu"
_ASSIST_MODELS: dict[int, Any] = {}
_ASSIST_MODEL_SOURCES: dict[int, str] = {}


def _payload_to_dict(payload: Any) -> dict[str, Any]:
    if hasattr(payload, "model_dump"):
        return payload.model_dump()
    if isinstance(payload, dict):
        return payload
    return dict(payload)


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
        raise ValueError("Annotation is currently supported only for MinIO-backed datasets.")
    return session, dataset


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


def _label_prefix(dataset_prefix: str, folder: str) -> str:
    return normalize_prefix(f"{dataset_prefix.rstrip('/')}/{folder}", "")


def _safe_label_name(media_key: str) -> str:
    path = PurePosixPath(media_key)
    return f"{path.stem}.txt"


def _class_names(usecase_slug: str, extra: list[str] | None = None) -> list[str]:
    names: list[str] = []
    for name in [*(DEFAULT_CLASSES_BY_USE_CASE.get(usecase_slug, ["object"])), *(extra or [])]:
        normalized = str(name or "").strip().lower()
        if normalized and normalized not in names:
            names.append(normalized)
    return names or ["object"]


def _normalize_detected_class_name(value: Any) -> str:
    name = str(value or "").strip().lower()
    if "smoke" in name:
        return "smoke"
    if "fire" in name or "flame" in name:
        return "fire"
    return name


def _list_objects(client: Any, bucket: str, prefix: str) -> list[Any]:
    return [
        obj
        for obj in client.list_objects(bucket, prefix=prefix, recursive=True)
        if not getattr(obj, "is_dir", False)
    ]


def _object_summary(client: Any, bucket: str, prefix: str, obj: Any, label_stems: set[str]) -> dict[str, Any]:
    object_key = str(obj.object_name)
    path = PurePosixPath(object_key)
    preview_url = build_presigned_get_url(
        client,
        bucket,
        object_key,
        settings.minio_presigned_expiry_minutes,
    )
    return {
        "object_key": object_key,
        "relative_key": object_key[len(prefix):] if prefix and object_key.startswith(prefix) else path.name,
        "file_name": path.name,
        "stem": path.stem,
        "size_bytes": int(getattr(obj, "size", 0) or 0),
        "last_modified": obj.last_modified.isoformat() if getattr(obj, "last_modified", None) else None,
        "preview_url": preview_url,
        "has_label": path.stem in label_stems,
        "annotations": [],
        "label_source": None,
    }


def _read_object_bytes(client: Any, bucket: str, object_key: str) -> bytes:
    response = client.get_object(bucket, object_key)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def _decode_image(data: bytes, object_key: str) -> np.ndarray:
    array = np.frombuffer(data, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"Unable to decode image '{PurePosixPath(object_key).name}'.")
    return image


def _validate_media_key(media_key: str, prefix: str) -> None:
    if not media_key or not media_key.startswith(prefix):
        raise ValueError("Selected media item does not belong to the active dataset prefix.")
    if PurePosixPath(media_key).suffix.lower() not in SUPPORTED_MEDIA_EXTENSIONS:
        raise ValueError("Selected media item is not a supported image or video file.")


def _normal_float(value: Any, field: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{field} must be a number.") from error
    if number < 0 or number > 1:
        raise ValueError(f"{field} must be between 0 and 1.")
    return number


def _annotation_lines(annotations: list[dict[str, Any]], class_names: list[str]) -> tuple[str, list[dict[str, Any]]]:
    lines: list[str] = []
    normalized_annotations: list[dict[str, Any]] = []
    for annotation in annotations:
        class_name = str(annotation.get("class_name") or "").strip().lower()
        if not class_name:
            class_id = int(annotation.get("class_id") or 0)
            class_name = class_names[class_id] if 0 <= class_id < len(class_names) else class_names[0]
        if class_name not in class_names:
            class_names.append(class_name)
        class_id = class_names.index(class_name)
        x_center = _normal_float(annotation.get("x_center"), "x_center")
        y_center = _normal_float(annotation.get("y_center"), "y_center")
        width = _normal_float(annotation.get("width"), "width")
        height = _normal_float(annotation.get("height"), "height")
        if width <= 0 or height <= 0:
            raise ValueError("Annotation width and height must be greater than 0.")
        lines.append(f"{class_id} {x_center:.6f} {y_center:.6f} {width:.6f} {height:.6f}")
        normalized_annotations.append(
            {
                "class_id": class_id,
                "class_name": class_name,
                "x_center": round(x_center, 6),
                "y_center": round(y_center, 6),
                "width": round(width, 6),
                "height": round(height, 6),
            }
        )
    return ("\n".join(lines) + ("\n" if lines else "")), normalized_annotations


def _annotation_from_yolo_line(line: str, class_names: list[str]) -> dict[str, Any] | None:
    parts = line.strip().split()
    if len(parts) != 5:
        return None
    try:
        class_id = int(float(parts[0]))
        x_center = float(parts[1])
        y_center = float(parts[2])
        width = float(parts[3])
        height = float(parts[4])
    except ValueError:
        return None
    if any(value < 0 or value > 1 for value in [x_center, y_center, width, height]):
        return None
    class_name = class_names[class_id] if 0 <= class_id < len(class_names) else f"class_{class_id}"
    return {
        "class_id": class_id,
        "class_name": class_name,
        "x_center": round(x_center, 6),
        "y_center": round(y_center, 6),
        "width": round(width, 6),
        "height": round(height, 6),
        "source": "saved",
    }


def _parse_yolo_annotations(text: str, class_names: list[str]) -> list[dict[str, Any]]:
    annotations: list[dict[str, Any]] = []
    for line in text.splitlines():
        annotation = _annotation_from_yolo_line(line, class_names)
        if annotation is not None:
            annotations.append(annotation)
    return annotations


def _valid_yolo_line_count(text: str) -> int:
    count = 0
    for line in text.splitlines():
        if _annotation_from_yolo_line(line, []) is not None:
            count += 1
    return count


def _label_source_for_key(object_key: str) -> str:
    parts = PurePosixPath(object_key).parts
    if MANUAL_LABEL_FOLDER in parts:
        return "manual"
    if "_imported_labels" in parts:
        return "imported"
    if AUTO_LABEL_FOLDER in parts:
        return "auto"
    return "existing"


def _label_source_priority(source: str) -> int:
    return {"manual": 40, "imported": 30, "auto": 20, "existing": 10}.get(source, 0)


def _build_label_index(
    objects: list[Any],
    client: Any,
    bucket: str,
    *,
    include_auto: bool = True,
    allowed_sources: set[str] | None = None,
) -> dict[str, dict[str, Any]]:
    labels_by_stem: dict[str, dict[str, Any]] = {}
    for obj in objects:
        object_key = str(obj.object_name)
        path = PurePosixPath(object_key)
        if path.suffix.lower() != ".txt":
            continue
        source = _label_source_for_key(object_key)
        if not include_auto and source == "auto":
            continue
        if allowed_sources is not None and source not in allowed_sources:
            continue
        try:
            valid_line_count = _valid_yolo_line_count(_read_object_bytes(client, bucket, object_key).decode("utf-8"))
        except Exception as error:
            print(
                "[labels] ignored unreadable label file",
                {
                    "object_key": object_key,
                    "source": source,
                    "error": str(error),
                },
            )
            continue
        if valid_line_count <= 0:
            print(
                "[labels] ignored empty label file",
                {
                    "object_key": object_key,
                    "source": source,
                },
            )
            continue
        existing = labels_by_stem.get(path.stem)
        if existing is None or _label_source_priority(source) > _label_source_priority(existing["source"]):
            labels_by_stem[path.stem] = {
                "object_key": object_key,
                "source": source,
                "valid_line_count": valid_line_count,
            }
    return labels_by_stem


def _build_export_label_index(objects: list[Any], client: Any, bucket: str) -> dict[str, dict[str, Any]]:
    return _build_label_index(objects, client, bucket, include_auto=False)


def _build_assist_training_label_index(objects: list[Any], client: Any, bucket: str) -> dict[str, dict[str, Any]]:
    return _build_label_index(objects, client, bucket, include_auto=False, allowed_sources={"manual", "imported"})


def _load_saved_annotations(
    client: Any,
    bucket: str,
    label_index: dict[str, dict[str, Any]],
    media_key: str,
    class_names: list[str],
) -> tuple[list[dict[str, Any]], str | None]:
    label = label_index.get(PurePosixPath(media_key).stem)
    if not label:
        return [], None
    try:
        text = _read_object_bytes(client, bucket, label["object_key"]).decode("utf-8")
    except Exception:
        return [], label["source"]
    annotations = _parse_yolo_annotations(text, class_names)
    for annotation in annotations:
        annotation["source"] = label["source"]
    return annotations, label["source"]


def _load_class_manifest(client: Any, bucket: str, prefix: str) -> list[str]:
    object_key = f"{_label_prefix(prefix, ANNOTATION_META_FOLDER)}classes.annotation-meta"
    try:
        payload = json.loads(_read_object_bytes(client, bucket, object_key).decode("utf-8"))
    except Exception:
        return []

    values = payload.get("classes") if isinstance(payload, dict) else []
    names: list[str] = []
    for value in values or []:
        normalized = str(value or "").strip().lower()
        if normalized and normalized not in names:
            names.append(normalized)
    return names


def _confidence_quality(confidence: float) -> str:
    if confidence > 0.7:
        return "high"
    if confidence >= 0.4:
        return "medium"
    return "low"


def _review_status(
    *,
    has_saved_annotations: bool,
    label_source: str | None,
    has_low_confidence_predictions: bool,
    has_medium_confidence_predictions: bool,
) -> str:
    if not has_saved_annotations:
        return "unlabeled"
    if label_source == "auto" or has_low_confidence_predictions or has_medium_confidence_predictions:
        return "needs_review"
    return "completed"


def _priority_details(
    *,
    saved_annotation_count: int,
    label_source: str | None,
    suggestion_count: int,
    has_low_confidence_predictions: bool,
    has_medium_confidence_predictions: bool,
) -> tuple[int, str, str]:
    is_unlabeled = saved_annotation_count == 0
    reasons: list[str] = []
    score = 0

    if is_unlabeled:
        score += 100
        reasons.append("No labels yet")
    elif label_source == "auto" or saved_annotation_count <= 1:
        score += 60
        reasons.append("Partially labeled")
    else:
        score += 15
        reasons.append("Already labeled")

    if has_low_confidence_predictions:
        score += 45
        reasons.append("Low-confidence detections need review")
    elif has_medium_confidence_predictions:
        score += 25
        reasons.append("Medium-confidence detections need review")
    elif suggestion_count:
        score += 10
        reasons.append("Suggestions ready for quick validation")
    elif is_unlabeled:
        score += 15
        reasons.append("No detections found; manual pass recommended")

    if score >= 100:
        tier = "high"
    elif score >= 60:
        tier = "medium"
    else:
        tier = "low"

    return score, tier, "; ".join(reasons[:2]) if reasons else "Review current labels"


def _put_text(client: Any, bucket: str, object_key: str, text: str, content_type: str = "text/plain") -> None:
    data = text.encode("utf-8")
    client.put_object(bucket, object_key, BytesIO(data), length=len(data), content_type=content_type)


def _put_class_manifest(client: Any, bucket: str, prefix: str, class_names: list[str], source: str) -> str:
    object_key = f"{_label_prefix(prefix, ANNOTATION_META_FOLDER)}classes.annotation-meta"
    _put_text(
        client,
        bucket,
        object_key,
        json.dumps({"source": source, "classes": class_names}, indent=2, sort_keys=True),
        content_type="application/json",
    )
    return object_key


def _slugify_path_component(value: str, fallback: str) -> str:
    cleaned = "".join(character.lower() if character.isalnum() else "-" for character in str(value or ""))
    normalized = "-".join(part for part in cleaned.split("-") if part)
    return normalized or fallback


def _export_image_stem(media_key: str, prefix: str) -> str:
    relative_key = media_key[len(prefix):] if prefix and media_key.startswith(prefix) else PurePosixPath(media_key).name
    path = PurePosixPath(relative_key)
    digest = hashlib.sha1(relative_key.encode("utf-8")).hexdigest()[:10]
    base_name = _slugify_path_component(path.stem, "image")
    return f"{base_name}-{digest}"


def _resolve_export_class_names(
    client: Any,
    bucket: str,
    prefix: str,
    usecase_slug: str,
    label_index: dict[str, dict[str, str]],
) -> list[str]:
    class_names = _class_names(usecase_slug, _load_class_manifest(client, bucket, prefix))
    highest_class_id = -1
    for record in label_index.values():
        try:
            text = _read_object_bytes(client, bucket, record["object_key"]).decode("utf-8")
        except Exception:
            continue
        for line in text.splitlines():
            parts = line.strip().split()
            if len(parts) != 5:
                continue
            try:
                class_id = int(float(parts[0]))
            except ValueError:
                continue
            if class_id >= 0:
                highest_class_id = max(highest_class_id, class_id)

    while highest_class_id >= len(class_names):
        class_names.append(f"class_{len(class_names)}")
    return class_names


def _split_export_media_keys(media_keys: list[str]) -> tuple[list[str], list[str]]:
    ordered = sorted(media_keys)
    if len(ordered) <= 1:
        return ordered, []

    val_count = max(1, int(round(len(ordered) * 0.2)))
    val_count = min(val_count, len(ordered) - 1)
    ranked = sorted(ordered, key=lambda key: hashlib.sha1(key.encode("utf-8")).hexdigest())
    val_keys = set(ranked[:val_count])
    train = [key for key in ordered if key not in val_keys]
    val = [key for key in ordered if key in val_keys]
    return train, val


def _write_yolo_data_yaml(export_dir: Path, class_names: list[str]) -> Path:
    lines = [
        f"path: {export_dir.as_posix()}",
        "train: images/train",
        "val: images/val",
        f"nc: {len(class_names)}",
        "names:",
    ]
    for index, class_name in enumerate(class_names):
        lines.append(f"  {index}: {json.dumps(class_name)}")

    yaml_path = export_dir / "data.yaml"
    yaml_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return yaml_path


def _assist_session_dataset_dir(session_id: int) -> Path:
    return ASSIST_MODEL_DIR / f"session_{session_id}_dataset"


def _assist_session_run_dir(session_id: int) -> Path:
    return ASSIST_MODEL_DIR / "runs" / f"session_{session_id}"


def _assist_session_model_path(session_id: int) -> Path:
    return ASSIST_MODEL_DIR / f"session_{session_id}_best.pt"


def _assist_training_split(media_keys: list[str]) -> tuple[list[str], list[str]]:
    ordered = sorted(media_keys)
    if not ordered:
        return [], []
    if len(ordered) == 1:
        return ordered, ordered

    val_count = max(1, int(round(len(ordered) * 0.2)))
    val_count = min(val_count, len(ordered) - 1)
    ranked = sorted(ordered, key=lambda key: hashlib.sha1(key.encode("utf-8")).hexdigest())
    val_keys = set(ranked[:val_count])
    train = [key for key in ordered if key not in val_keys]
    val = [key for key in ordered if key in val_keys]
    if not train:
        train = val[:1]
    if not val:
        val = train[:1]
    return train, val


def _load_assist_base_model() -> tuple[Any, str]:
    from ultralytics import YOLO

    errors: list[str] = []
    for candidate in ASSIST_BASE_MODEL_CANDIDATES:
        try:
            print(f"Loading assist base model from {candidate}")
            return YOLO(candidate), candidate
        except Exception as error:
            errors.append(f"{candidate}: {error}")
    raise ValueError(
        "Assist model training could not load a supported YOLO base model. "
        f"Tried {', '.join(ASSIST_BASE_MODEL_CANDIDATES)}. Errors: {' | '.join(errors)}"
    )


def _load_session_assist_model(session_id: int) -> tuple[Any, str]:
    cached = _ASSIST_MODELS.get(session_id)
    cached_source = _ASSIST_MODEL_SOURCES.get(session_id)
    model_path = _assist_session_model_path(session_id)
    if cached is not None and cached_source == str(model_path) and model_path.is_file():
        return cached, cached_source

    if not model_path.is_file():
        raise ValueError("No assist model has been trained for this session yet. Learn from labeled images first.")

    from ultralytics import YOLO

    try:
        print(f"Loading session assist model from {model_path}")
        model = YOLO(str(model_path))
    except Exception as error:
        raise ValueError(f"Unable to load the session assist model from {model_path}: {error}") from error
    _ASSIST_MODELS[session_id] = model
    _ASSIST_MODEL_SOURCES[session_id] = str(model_path)
    return model, str(model_path)


def _resolve_media_key(data: dict[str, Any], objects: list[Any], prefix: str) -> str:
    candidate = str(data.get("media_object_key") or data.get("item_id") or "").strip()
    media_objects = [
        str(obj.object_name)
        for obj in objects
        if PurePosixPath(str(obj.object_name)).suffix.lower() in SUPPORTED_MEDIA_EXTENSIONS
    ]
    if candidate:
        if candidate in media_objects:
            return candidate
        if candidate.startswith(prefix) and any(candidate == item for item in media_objects):
            return candidate

    file_name = str(data.get("file_name") or "").strip()
    if file_name:
        matches = [item for item in media_objects if PurePosixPath(item).name == file_name]
        if len(matches) == 1:
            return matches[0]
        if len(matches) > 1:
            raise ValueError("file_name matched more than one dataset item. Send item_id/media_object_key instead.")

    raise ValueError("Manual annotation save requires item_id, media_object_key, or file_name for one dataset item.")


def _readiness_status(score: int) -> str:
    if score >= 85:
        return "ready"
    if score >= 70:
        return "mostly_ready"
    if score >= 50:
        return "needs_cleanup"
    return "not_ready"


def _refresh_after_annotation(
    *,
    session: dict[str, Any],
    dataset: dict[str, Any],
    client: Any,
    config: MinioConnectionConfig,
    source: str,
    warnings: list[dict[str, str]] | None = None,
    recommendations: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    objects = _list_objects(client, config.bucket, config.input_prefix)
    media_count = sum(1 for obj in objects if PurePosixPath(str(obj.object_name)).suffix.lower() in SUPPORTED_MEDIA_EXTENSIONS)
    label_stems = set(_build_export_label_index(objects, client, config.bucket).keys())
    label_count = len(label_stems)
    unlabeled_count = max(media_count - label_count, 0)
    print(
        "[annotation-refresh] labeled/unlabeled count",
        {
            "session_id": int(session["id"]),
            "dataset_id": int(dataset["id"]),
            "labeled_images": label_count,
            "unlabeled_images": unlabeled_count,
        },
    )
    coverage = label_coverage(media_count, label_count)
    label_status = compute_label_status(media_count, label_count)
    readiness_score = 92 if label_status == "ready" else 72 if label_status == "partial" else 42
    issues = list(warnings or [])
    recs = list(recommendations or [])
    if label_status == "partial":
        issues.append({"code": "partial_label_coverage", "message": f"Labels cover {round(coverage * 100)}% of dataset media.", "severity": "medium"})
        recs.append({"code": "finish_labeling", "message": "Annotate the remaining examples before training for best results."})
    if label_status == "missing":
        issues.append({"code": "labels_missing", "message": "No label files were found after annotation.", "severity": "high"})
        recs.append({"code": "add_labels", "message": "Add annotations before starting training."})

    summary = {
        "bucket_accessible": True,
        "prefix_exists": bool(objects),
        "bucket": config.bucket,
        "prefix": config.input_prefix,
        "annotation_source": source,
        "file_count": media_count,
        "supported_file_count": media_count,
        "label_file_count": label_count,
        "label_coverage": round(coverage, 4),
        "label_status": label_status,
        "readiness_status": _readiness_status(readiness_score),
    }
    audit = create_dataset_audit(dataset_id=int(dataset["id"]), session_id=int(session["id"]), status="running")
    completed_audit = complete_dataset_audit(
        int(audit["id"]),
        status=_readiness_status(readiness_score),
        readiness_score=readiness_score,
        issues=issues,
        recommendations=recs,
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
            "Annotations saved. Label readiness has been refreshed."
            if label_status == "ready"
            else "Annotations saved with partial coverage. Continue labeling until coverage is acceptable."
        ),
    )
    return {
        "dataset": updated_dataset,
        "audit": completed_audit,
        "summary": summary,
        "label_state": get_label_state(int(session["id"])),
    }


def get_annotation_workspace(session_id: int, *, limit: int = 30) -> dict[str, Any]:
    session, dataset = _session_and_selected_dataset(session_id)
    config = _minio_config_for_dataset(dataset)
    client = create_client(config)
    validate_bucket_access(client, config.bucket)

    objects = _list_objects(client, config.bucket, config.input_prefix)
    label_index = _build_label_index(objects, client, config.bucket)
    label_stems = set(label_index.keys())
    image_objects = [
        obj
        for obj in objects
        if PurePosixPath(str(obj.object_name)).suffix.lower() in IMAGE_EXTENSIONS
    ]
    image_objects = sorted(image_objects, key=lambda item: str(item.object_name))[: max(1, min(int(limit or 30), 100))]
    classes = _class_names(str(session["usecase_slug"]))
    items = []
    for obj in image_objects:
        summary = _object_summary(client, config.bucket, config.input_prefix, obj, label_stems)
        annotations, label_source = _load_saved_annotations(
            client,
            config.bucket,
            label_index,
            str(obj.object_name),
            classes,
        )
        summary["annotations"] = annotations
        summary["label_source"] = label_source
        summary["annotation_count"] = len(annotations)
        summary["saved_annotation_count"] = len(annotations)
        summary["has_low_confidence_predictions"] = False
        summary["has_medium_confidence_predictions"] = False
        summary["suggestion_count"] = 0
        summary["review_status"] = _review_status(
            has_saved_annotations=bool(annotations),
            label_source=label_source,
            has_low_confidence_predictions=False,
            has_medium_confidence_predictions=False,
        )
        items.append(summary)
    return {
        "session_id": int(session["id"]),
        "dataset_id": int(dataset["id"]),
        "dataset_name": str(dataset["name"]),
        "classes": classes,
        "items": items,
        "item_count": len(image_objects),
        "label_count": len(label_stems),
    }


def save_manual_annotations(session_id: int, payload: Any) -> dict[str, Any]:
    session, dataset = _session_and_selected_dataset(session_id)
    data = _payload_to_dict(payload)
    raw_annotations = data.get("annotations") or []
    if not isinstance(raw_annotations, list):
        raise ValueError("annotations must be a list.")

    config = _minio_config_for_dataset(dataset)
    client = create_client(config)
    validate_bucket_access(client, config.bucket)
    objects = _list_objects(client, config.bucket, config.input_prefix)
    media_key = _resolve_media_key(data, objects, config.input_prefix)
    _validate_media_key(media_key, config.input_prefix)
    client.stat_object(config.bucket, media_key)

    classes = _class_names(str(session["usecase_slug"]), [str(item) for item in data.get("class_names") or []])
    label_text, normalized_annotations = _annotation_lines(raw_annotations, classes)
    label_key = f"{_label_prefix(config.input_prefix, MANUAL_LABEL_FOLDER)}{_safe_label_name(media_key)}"
    save_status = "saved"
    if normalized_annotations:
        _put_text(client, config.bucket, label_key, label_text)
    else:
        save_status = "cleared"
        print(
            "[manual-annotation] empty label save",
            {
                "session_id": int(session["id"]),
                "dataset_id": int(dataset["id"]),
                "media_object_key": media_key,
                "label_object_key": label_key,
            },
        )
        try:
            client.remove_object(config.bucket, label_key)
        except Exception:
            pass
    class_manifest_key = _put_class_manifest(client, config.bucket, config.input_prefix, classes, "manual")
    refreshed = _refresh_after_annotation(
        session=session,
        dataset=dataset,
        client=client,
        config=config,
        source="manual",
    )
    updated_objects = _list_objects(client, config.bucket, config.input_prefix)
    effective_label_index = _build_label_index(updated_objects, client, config.bucket)
    effective_label_record = effective_label_index.get(PurePosixPath(media_key).stem)
    effective_annotations, effective_label_source = _load_saved_annotations(
        client,
        config.bucket,
        effective_label_index,
        media_key,
        classes,
    )
    return {
        "session_id": int(session["id"]),
        "dataset_id": int(dataset["id"]),
        "save_status": save_status,
        "annotation_format": "yolo",
        "media_object_key": media_key,
        "label_object_key": effective_label_record["object_key"] if effective_label_record else None,
        "class_manifest_key": class_manifest_key,
        "annotation_count": len(effective_annotations),
        "annotations": effective_annotations,
        "label_source": effective_label_source,
        "has_label": bool(effective_annotations),
        **refreshed,
    }


def _load_auto_label_model() -> tuple[Any, str]:
    global _AUTO_LABEL_MODEL, _AUTO_LABEL_MODEL_SOURCE
    if _AUTO_LABEL_MODEL is not None:
        return _AUTO_LABEL_MODEL, _AUTO_LABEL_MODEL_SOURCE

    from ultralytics import YOLO

    def _download_fire_smoke_model() -> Path:
        FIRE_SMOKE_MODEL_DIR.mkdir(parents=True, exist_ok=True)
        temp_path = FIRE_SMOKE_MODEL_PATH.with_suffix(".download")
        last_error: Exception | None = None
        for url in FIRE_SMOKE_MODEL_URLS:
            try:
                print(f"Downloading fire/smoke auto-label model from {url}")
                request = Request(url, headers={"User-Agent": "SutherlandHub-Step3-AutoLabel"})
                with urlopen(request, timeout=90) as response, temp_path.open("wb") as target:
                    shutil.copyfileobj(response, target)
                size_bytes = temp_path.stat().st_size
                if size_bytes < 1_000_000:
                    raise ValueError(f"Downloaded model is unexpectedly small ({size_bytes} bytes).")
                temp_path.replace(FIRE_SMOKE_MODEL_PATH)
                print(f"Cached fire/smoke auto-label model at {FIRE_SMOKE_MODEL_PATH}")
                return FIRE_SMOKE_MODEL_PATH
            except Exception as error:
                last_error = error
                if temp_path.exists():
                    temp_path.unlink()
        raise ValueError(
            "Fire/smoke auto-label model is unavailable. "
            f"Expected local weights at {FIRE_SMOKE_MODEL_PATH} or a downloadable backup. Last error: {last_error}"
        )

    model_path = FIRE_SMOKE_MODEL_PATH if FIRE_SMOKE_MODEL_PATH.is_file() else _download_fire_smoke_model()
    try:
        print(f"Loading fire/smoke auto-label model from {model_path}")
        _AUTO_LABEL_MODEL = YOLO(str(model_path))
        _AUTO_LABEL_MODEL_SOURCE = str(model_path)
        return _AUTO_LABEL_MODEL, _AUTO_LABEL_MODEL_SOURCE
    except Exception as error:
        raise ValueError(f"Fire/smoke auto-label model could not be loaded from {model_path}: {error}") from error


def _load_grounding_dino_model() -> tuple[Any, Any, str, str]:
    global _GROUNDING_DINO_MODEL, _GROUNDING_DINO_PROCESSOR, _GROUNDING_DINO_MODEL_SOURCE, _GROUNDING_DINO_DEVICE
    if _GROUNDING_DINO_MODEL is not None and _GROUNDING_DINO_PROCESSOR is not None:
        return _GROUNDING_DINO_PROCESSOR, _GROUNDING_DINO_MODEL, _GROUNDING_DINO_MODEL_SOURCE, _GROUNDING_DINO_DEVICE

    try:
        import torch
        from transformers import AutoModelForZeroShotObjectDetection, AutoProcessor
    except Exception as error:
        raise ValueError(f"Grounding DINO dependencies are unavailable: {error}") from error

    device = "cuda" if torch.cuda.is_available() else "cpu"
    try:
        print(f"Loading Grounding DINO model from {GROUNDING_DINO_MODEL_NAME} on {device}")
        processor = AutoProcessor.from_pretrained(GROUNDING_DINO_MODEL_NAME)
        model = AutoModelForZeroShotObjectDetection.from_pretrained(GROUNDING_DINO_MODEL_NAME)
        model = model.to(device)
        model.eval()
        _GROUNDING_DINO_PROCESSOR = processor
        _GROUNDING_DINO_MODEL = model
        _GROUNDING_DINO_MODEL_SOURCE = GROUNDING_DINO_MODEL_NAME
        _GROUNDING_DINO_DEVICE = device
        return processor, model, _GROUNDING_DINO_MODEL_SOURCE, _GROUNDING_DINO_DEVICE
    except Exception as error:
        raise ValueError(f"Grounding DINO model could not be loaded from {GROUNDING_DINO_MODEL_NAME}: {error}") from error


def _grounding_prompt_text(prompts: list[str], class_names: list[str]) -> str:
    prompt_terms = _grounding_prompts(prompts, class_names)
    return ". ".join(prompt_terms) + "."


def _post_process_grounding_dino_detections(
    *,
    processor: Any,
    outputs: Any,
    inputs: dict[str, Any],
    confidence: float,
    target_size: tuple[int, int],
) -> list[dict[str, Any]]:
    threshold = max(0.0, min(float(confidence or 0.25), 1.0))
    text_threshold = max(0.2, min(threshold, 0.6))
    input_ids = inputs.get("input_ids")
    method = processor.post_process_grounded_object_detection

    try:
        parameters = inspect.signature(method).parameters
    except (TypeError, ValueError):
        parameters = {}

    preferred_kwargs: dict[str, Any] = {"target_sizes": [target_size]}
    if "input_ids" in parameters and input_ids is not None:
        preferred_kwargs["input_ids"] = input_ids
    if "threshold" in parameters:
        preferred_kwargs["threshold"] = threshold
    elif "box_threshold" in parameters:
        preferred_kwargs["box_threshold"] = threshold
    else:
        preferred_kwargs["threshold"] = threshold
    if "text_threshold" in parameters:
        preferred_kwargs["text_threshold"] = text_threshold

    candidate_calls: list[tuple[tuple[Any, ...], dict[str, Any]]] = [((), preferred_kwargs)]

    fallback_variants = [
        {"target_sizes": [target_size], "threshold": threshold, "text_threshold": text_threshold},
        {"target_sizes": [target_size], "box_threshold": threshold, "text_threshold": text_threshold},
    ]
    if input_ids is not None:
        fallback_variants = [
            {"input_ids": input_ids, **variant}
            for variant in fallback_variants
        ] + fallback_variants
        candidate_calls.extend([((input_ids,), variant) for variant in fallback_variants])
    candidate_calls.extend([((), variant) for variant in fallback_variants])

    last_error: Exception | None = None
    attempted: set[tuple[tuple[Any, ...], tuple[tuple[str, str], ...]]] = set()
    for args, kwargs in candidate_calls:
        key = (
            tuple(str(arg.__class__.__name__) for arg in args),
            tuple(sorted((str(name), str(type(value).__name__)) for name, value in kwargs.items())),
        )
        if key in attempted:
            continue
        attempted.add(key)
        try:
            return method(outputs, *args, **kwargs)
        except TypeError as error:
            last_error = error
            continue

    raise ValueError(
        "Grounding DINO post-processing is incompatible with the installed transformers version. "
        f"Last error: {last_error}"
    )


def _annotation_from_xyxy(
    *,
    xyxy: list[float],
    width: int,
    height: int,
    class_name: str,
    class_names: list[str],
    confidence: float,
    source: str,
) -> dict[str, Any]:
    normalized_name = _normalize_detected_class_name(class_name)
    if normalized_name not in class_names:
        class_names.append(normalized_name)
    x1, y1, x2, y2 = [float(value) for value in xyxy]
    x_center = round(((x1 + x2) / 2) / max(width, 1), 6)
    y_center = round(((y1 + y2) / 2) / max(height, 1), 6)
    box_width = round(max(x2 - x1, 1) / max(width, 1), 6)
    box_height = round(max(y2 - y1, 1) / max(height, 1), 6)
    confidence_score = round(float(confidence), 4)
    quality = _confidence_quality(confidence_score)
    return {
        "class_id": class_names.index(normalized_name),
        "class_name": normalized_name,
        "x_center": x_center,
        "y_center": y_center,
        "width": box_width,
        "height": box_height,
        "bbox": [x_center, y_center, box_width, box_height],
        "confidence": confidence_score,
        "quality": quality,
        "source": source,
    }


def _load_sam_model() -> tuple[Any, Any, str, str]:
    global _SAM_MODEL, _SAM_PROCESSOR, _SAM_MODEL_SOURCE, _SAM_DEVICE
    if _SAM_MODEL is not None and _SAM_PROCESSOR is not None:
        return _SAM_PROCESSOR, _SAM_MODEL, _SAM_MODEL_SOURCE, _SAM_DEVICE

    try:
        import torch
        from transformers import SamModel, SamProcessor
    except Exception as error:
        raise ValueError(f"SAM dependencies are unavailable: {error}") from error

    device = "cuda" if torch.cuda.is_available() else "cpu"
    try:
        print(f"Loading SAM model from {SAM_MODEL_NAME} on {device}")
        processor = SamProcessor.from_pretrained(SAM_MODEL_NAME)
        model = SamModel.from_pretrained(SAM_MODEL_NAME)
        model = model.to(device)
        model.eval()
        _SAM_PROCESSOR = processor
        _SAM_MODEL = model
        _SAM_MODEL_SOURCE = SAM_MODEL_NAME
        _SAM_DEVICE = device
        return processor, model, _SAM_MODEL_SOURCE, _SAM_DEVICE
    except Exception as error:
        raise ValueError(f"SAM model could not be loaded from {SAM_MODEL_NAME}: {error}") from error


def _pixel_point_from_normalized(point: dict[str, Any], width: int, height: int) -> list[list[float]]:
    x = max(0.0, min(1.0, float(point.get("x") or 0.0)))
    y = max(0.0, min(1.0, float(point.get("y") or 0.0)))
    return [[[round(x * max(width - 1, 1), 2), round(y * max(height - 1, 1), 2)]]]


def _xyxy_from_normalized_box(box: dict[str, Any], width: int, height: int) -> list[list[list[float]]]:
    x_center = _normal_float(box.get("x_center"), "box.x_center")
    y_center = _normal_float(box.get("y_center"), "box.y_center")
    box_width = _normal_float(box.get("width"), "box.width")
    box_height = _normal_float(box.get("height"), "box.height")
    x1 = max(0.0, (x_center - box_width / 2) * max(width - 1, 1))
    y1 = max(0.0, (y_center - box_height / 2) * max(height - 1, 1))
    x2 = min(max(width - 1, 1), (x_center + box_width / 2) * max(width - 1, 1))
    y2 = min(max(height - 1, 1), (y_center + box_height / 2) * max(height - 1, 1))
    return [[[round(x1, 2), round(y1, 2), round(x2, 2), round(y2, 2)]]]


def _mask_to_png_data_url(mask: np.ndarray) -> str:
    rgba = np.zeros((mask.shape[0], mask.shape[1], 4), dtype=np.uint8)
    rgba[..., 1] = 180
    rgba[..., 3] = np.where(mask > 0, 110, 0).astype(np.uint8)
    success, encoded = cv2.imencode(".png", rgba)
    if not success:
        raise ValueError("Unable to encode SAM preview mask.")
    return f"data:image/png;base64,{base64.b64encode(encoded.tobytes()).decode('ascii')}"


def _mask_to_xyxy(mask: np.ndarray) -> list[float]:
    positions = np.column_stack(np.where(mask > 0))
    if positions.size == 0:
        raise ValueError("SAM did not produce a usable mask for this prompt.")
    y_values = positions[:, 0]
    x_values = positions[:, 1]
    x1 = float(x_values.min())
    y1 = float(y_values.min())
    x2 = float(x_values.max())
    y2 = float(y_values.max())
    return [x1, y1, x2, y2]


def _prompt_terms(value: Any) -> list[str]:
    raw = value or []
    if isinstance(raw, str):
        raw = raw.split(",")
    return [str(item).strip().lower() for item in raw if str(item).strip()]


def _auto_label_mode(value: Any) -> str:
    normalized = str(value or "yolo").strip().lower()
    if normalized in {"grounding", "prompt", "prompt-based", "grounding-dino"}:
        return "grounding"
    return "yolo"


def _grounding_prompts(prompts: list[str], class_names: list[str]) -> list[str]:
    values = prompts or class_names or ["object"]
    normalized_terms: list[str] = []
    for term in values:
        normalized = _normalize_detected_class_name(term)
        if normalized and normalized not in normalized_terms:
            normalized_terms.append(normalized)
    return normalized_terms or ["object"]


def _selected_image_objects(
    objects: list[Any],
    item_ids: list[str],
    limit: int,
    *,
    unlabeled_only: bool = False,
    client: Any | None = None,
    bucket: str = "",
) -> list[Any]:
    label_index = _build_label_index(objects, client, bucket) if unlabeled_only and client is not None and bucket else {}
    images = [
        obj
        for obj in objects
        if PurePosixPath(str(obj.object_name)).suffix.lower() in IMAGE_EXTENSIONS
    ]
    if unlabeled_only:
        images = [obj for obj in images if PurePosixPath(str(obj.object_name)).stem not in label_index]
    if item_ids:
        wanted = set(item_ids)
        images = [
            obj
            for obj in images
            if str(obj.object_name) in wanted or PurePosixPath(str(obj.object_name)).name in wanted
        ]
    return images[:limit]


def _prepare_assist_training_dataset(
    *,
    session_id: int,
    session: dict[str, Any],
    dataset: dict[str, Any],
    client: Any,
    config: MinioConnectionConfig,
    objects: list[Any],
) -> dict[str, Any]:
    label_index = _build_assist_training_label_index(objects, client, config.bucket)
    if not label_index:
        raise ValueError("Learn from labeled images needs saved manual or imported labels first.")

    image_objects = {
        str(obj.object_name): obj
        for obj in objects
        if PurePosixPath(str(obj.object_name)).suffix.lower() in IMAGE_EXTENSIONS
    }
    labeled_media_keys = sorted(
        media_key
        for media_key in image_objects
        if PurePosixPath(media_key).stem in label_index
    )
    if not labeled_media_keys:
        raise ValueError("No saved manual or imported labels matched the selected dataset images.")

    class_names = _resolve_export_class_names(
        client,
        config.bucket,
        config.input_prefix,
        str(session["usecase_slug"]),
        label_index,
    )
    dataset_dir = _assist_session_dataset_dir(session_id)
    if dataset_dir.exists():
        shutil.rmtree(dataset_dir)
    for relative_dir in ["images/train", "images/val", "labels/train", "labels/val"]:
        (dataset_dir / relative_dir).mkdir(parents=True, exist_ok=True)

    train_keys, val_keys = _assist_training_split(labeled_media_keys)
    split_memberships = {key: set() for key in labeled_media_keys}
    for key in train_keys:
        split_memberships.setdefault(key, set()).add("train")
    for key in val_keys:
        split_memberships.setdefault(key, set()).add("val")

    class_image_counts = {class_name: 0 for class_name in class_names}
    labeled_object_count = 0
    label_source_counts = {"manual": 0, "imported": 0}

    for media_key in labeled_media_keys:
        export_stem = _export_image_stem(media_key, config.input_prefix)
        label_record = label_index.get(PurePosixPath(media_key).stem)
        if not label_record:
            continue
        label_text = _read_object_bytes(client, config.bucket, label_record["object_key"]).decode("utf-8")
        image_bytes = _read_object_bytes(client, config.bucket, media_key)
        for split in sorted(split_memberships.get(media_key) or {"train"}):
            image_suffix = PurePosixPath(media_key).suffix.lower()
            image_path = dataset_dir / "images" / split / f"{export_stem}{image_suffix}"
            image_path.write_bytes(image_bytes)
            label_path = dataset_dir / "labels" / split / f"{export_stem}.txt"
            label_path.write_text(label_text, encoding="utf-8")

        annotations = _parse_yolo_annotations(label_text, class_names)
        labeled_object_count += len(annotations)
        seen_class_names = {annotation["class_name"] for annotation in annotations}
        for class_name in seen_class_names:
            if class_name not in class_image_counts:
                class_image_counts[class_name] = 0
            class_image_counts[class_name] += 1

        source = str(label_record.get("source") or "")
        if source in label_source_counts:
            label_source_counts[source] += 1

    data_yaml_path = _write_yolo_data_yaml(dataset_dir, class_names)
    if labeled_object_count <= 0:
        raise ValueError("Assist model training needs at least one saved object annotation.")

    low_coverage_classes = [
        class_name
        for class_name, image_count in class_image_counts.items()
        if image_count < 10
    ]
    warning = (
        "For better results, label at least 10 images per class."
        if low_coverage_classes
        else ""
    )
    return {
        "session_id": int(session["id"]),
        "dataset_id": int(dataset["id"]),
        "dataset_name": str(dataset["name"]),
        "dataset_dir": dataset_dir,
        "data_yaml_path": data_yaml_path,
        "class_names": class_names,
        "class_image_counts": class_image_counts,
        "label_source_counts": label_source_counts,
        "label_file_count": len(label_index),
        "labeled_image_count": len(labeled_media_keys),
        "labeled_object_count": labeled_object_count,
        "train_images": len(train_keys),
        "val_images": len(val_keys),
        "warning": warning,
        "low_coverage_classes": low_coverage_classes,
    }


def _predict_annotations_for_images(
    *,
    client: Any,
    bucket: str,
    image_objects: list[Any],
    class_names: list[str],
    prompts: list[str],
    confidence: float,
    mode: str = "yolo",
    model_override: Any | None = None,
    model_source_override: str = "",
    debug_context: str = "",
) -> tuple[list[dict[str, Any]], str]:
    predicted_items: list[dict[str, Any]] = []
    prompt_set = {_normalize_detected_class_name(term) for term in prompts if _normalize_detected_class_name(term)}
    selected_mode = _auto_label_mode(mode)
    if selected_mode == "grounding":
        processor, model, model_source, device = _load_grounding_dino_model()
        grounding_text = _grounding_prompt_text(prompts, class_names)
    else:
        if model_override is not None:
            model = model_override
            model_source = model_source_override or "custom"
        else:
            model, model_source = _load_auto_label_model()
        processor = None
        device = "cpu"
        grounding_text = ""

    for obj in image_objects:
        object_key = str(obj.object_name)
        image = _decode_image(_read_object_bytes(client, bucket, object_key), object_key)
        height, width = image.shape[:2]
        annotations: list[dict[str, Any]] = []
        raw_detection_count = 0
        print(f"Auto-label mode: {selected_mode}; prompts: {sorted(prompt_set) if prompt_set else ['<all>']}")
        if selected_mode == "grounding":
            try:
                import torch
            except Exception as error:
                raise ValueError(f"Grounding DINO requires torch at runtime: {error}") from error
            rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            inputs = processor(images=rgb_image, text=grounding_text, return_tensors="pt")
            inputs = {key: value.to(device) if hasattr(value, "to") else value for key, value in inputs.items()}
            with torch.inference_mode():
                outputs = model(**inputs)
            results = _post_process_grounding_dino_detections(
                processor=processor,
                outputs=outputs,
                inputs=inputs,
                confidence=confidence,
                target_size=(height, width),
            )
            for result in results or []:
                boxes = result.get("boxes")
                scores = result.get("scores")
                labels = result.get("labels")
                if boxes is None or scores is None or labels is None:
                    continue
                box_rows = boxes.detach().cpu().tolist() if hasattr(boxes, "detach") else boxes.tolist()
                score_rows = scores.detach().cpu().tolist() if hasattr(scores, "detach") else scores.tolist()
                label_rows = labels
                raw_detection_count += len(box_rows)
                for xyxy, score, raw_label in zip(box_rows, score_rows, label_rows):
                    class_name = _normalize_detected_class_name(raw_label)
                    if prompt_set and class_name not in prompt_set:
                        continue
                    annotations.append(
                        _annotation_from_xyxy(
                            xyxy=xyxy,
                            width=width,
                            height=height,
                            class_name=class_name,
                            class_names=class_names,
                            confidence=float(score),
                            source="suggestion",
                        )
                    )
        else:
            results = model(image, conf=confidence, verbose=False)
            for result in results or []:
                names = result.names or {}
                if result.boxes is None:
                    continue
                xyxy_rows = result.boxes.xyxy.cpu().tolist()
                score_rows = result.boxes.conf.cpu().tolist()
                class_rows = result.boxes.cls.cpu().tolist()
                raw_detection_count += len(xyxy_rows)
                for xyxy, score, raw_class_id in zip(xyxy_rows, score_rows, class_rows):
                    class_id = int(raw_class_id)
                    class_name = _normalize_detected_class_name(names.get(class_id, class_id))
                    if prompt_set and class_name not in prompt_set:
                        continue
                    annotations.append(
                        _annotation_from_xyxy(
                            xyxy=xyxy,
                            width=width,
                            height=height,
                            class_name=class_name,
                            class_names=class_names,
                            confidence=float(score),
                            source="suggestion",
                        )
                    )
        filtered_detection_count = len(annotations)
        print(f"Detections found for {PurePosixPath(object_key).name}: {filtered_detection_count}")
        if debug_context:
            print(
                f"[{debug_context}] {PurePosixPath(object_key).name}: "
                f"raw_detections={raw_detection_count} filtered_detections={filtered_detection_count}"
            )
        suggestions = [
            {
                "class_name": annotation["class_name"],
                "confidence": annotation["confidence"],
                "bbox": annotation["bbox"],
                "quality": annotation["quality"],
            }
            for annotation in annotations
        ]
        predicted_items.append(
            {
                "item_id": object_key,
                "media_object_key": object_key,
                "file_name": PurePosixPath(object_key).name,
                "preview_url": build_presigned_get_url(
                    client,
                    bucket,
                    object_key,
                    settings.minio_presigned_expiry_minutes,
                ),
                "last_modified": obj.last_modified.isoformat() if getattr(obj, "last_modified", None) else None,
                "annotation_count": 0,
                "saved_annotation_count": 0,
                "suggestion_count": len(annotations),
                "raw_detection_count": raw_detection_count,
                "filtered_detection_count": filtered_detection_count,
                "has_low_confidence_predictions": any(annotation["quality"] == "low" for annotation in annotations),
                "has_medium_confidence_predictions": any(annotation["quality"] == "medium" for annotation in annotations),
                "annotations": annotations,
                "suggestions": suggestions,
            }
        )
    return predicted_items, model_source


def auto_label_dataset(session_id: int, payload: Any) -> dict[str, Any]:
    session, dataset = _session_and_selected_dataset(session_id)
    data = _payload_to_dict(payload)
    requested_mode = _auto_label_mode(data.get("mode"))
    prompts = _prompt_terms(data.get("prompts"))
    item_ids = [str(item).strip() for item in data.get("item_ids") or [] if str(item).strip()]
    limit = max(1, min(int(data.get("limit") or 12), 50))
    confidence = max(0.05, min(float(data.get("confidence") or 0.25), 0.95))

    config = _minio_config_for_dataset(dataset)
    client = create_client(config)
    validate_bucket_access(client, config.bucket)
    objects = _list_objects(client, config.bucket, config.input_prefix)
    image_objects = _selected_image_objects(objects, item_ids, limit)
    if not image_objects:
        raise ValueError("No supported images were found in the selected dataset for auto-labeling.")

    class_names = _class_names(str(session["usecase_slug"]), prompts)
    mode_used = requested_mode
    fallback_used = False
    predicted_items, model_source = _predict_annotations_for_images(
        client=client,
        bucket=config.bucket,
        image_objects=image_objects,
        class_names=class_names,
        prompts=prompts,
        confidence=confidence,
        mode=mode_used,
    )
    suggested_items = []
    for item in predicted_items:
        if not item["annotations"]:
            continue
        suggested_items.append(
            {
                **item,
                "review_status": _review_status(
                    has_saved_annotations=False,
                    label_source=None,
                    has_low_confidence_predictions=bool(item.get("has_low_confidence_predictions")),
                    has_medium_confidence_predictions=bool(item.get("has_medium_confidence_predictions")),
                ),
            }
        )
    if requested_mode == "yolo" and not suggested_items:
        predicted_items, model_source = _predict_annotations_for_images(
            client=client,
            bucket=config.bucket,
            image_objects=image_objects,
            class_names=class_names,
            prompts=prompts,
            confidence=confidence,
            mode="grounding",
        )
        fallback_used = True
        mode_used = "grounding"
        suggested_items = []
        for item in predicted_items:
            if not item["annotations"]:
                continue
            suggested_items.append(
                {
                    **item,
                    "review_status": _review_status(
                        has_saved_annotations=False,
                        label_source=None,
                        has_low_confidence_predictions=bool(item.get("has_low_confidence_predictions")),
                        has_medium_confidence_predictions=bool(item.get("has_medium_confidence_predictions")),
                    ),
                }
            )
    uncertain_item_count = sum(
        1
        for item in suggested_items
        if item.get("has_low_confidence_predictions") or item.get("has_medium_confidence_predictions")
    )
    if not suggested_items:
        return {
            "session_id": int(session["id"]),
            "dataset_id": int(dataset["id"]),
            "auto_label_status": "no_detections",
            "annotation_format": "yolo",
            "model_source": model_source,
            "requested_mode": requested_mode,
            "mode_used": mode_used,
            "fallback_used": fallback_used,
            "prompts": prompts,
            "processed_item_count": len(image_objects),
            "suggested_label_count": 0,
            "low_confidence_item_count": 0,
            "classes": class_names,
            "items": [],
            "finalized": False,
            "message": (
                "No detections found from YOLO or prompt-based Grounding DINO."
                if fallback_used
                else "No detections found for given prompts."
            ),
        }
    backend_label = "Prompt-based Grounding DINO" if mode_used == "grounding" else "YOLO"
    fallback_note = " YOLO found no detections, so prompt-based Grounding DINO was used as a fallback." if fallback_used else ""
    return {
        "session_id": int(session["id"]),
        "dataset_id": int(dataset["id"]),
        "auto_label_status": "suggestions_ready",
        "annotation_format": "yolo",
        "model_source": model_source,
        "requested_mode": requested_mode,
        "mode_used": mode_used,
        "fallback_used": fallback_used,
        "prompts": prompts,
        "processed_item_count": len(image_objects),
        "suggested_label_count": len(suggested_items),
        "low_confidence_item_count": uncertain_item_count,
        "classes": class_names,
        "items": suggested_items,
        "finalized": False,
        "message": (
            f"{backend_label} suggestions are ready to review.{fallback_note} "
            f"Focus on {uncertain_item_count} image(s) with medium or low-confidence detections."
            if uncertain_item_count
            else f"{backend_label} suggestions are ready to review.{fallback_note} Review, edit, and save them before they become ground-truth labels."
        ),
    }


def segment_with_sam(session_id: int, payload: Any) -> dict[str, Any]:
    session, dataset = _session_and_selected_dataset(session_id)
    data = _payload_to_dict(payload)

    config = _minio_config_for_dataset(dataset)
    client = create_client(config)
    validate_bucket_access(client, config.bucket)
    objects = _list_objects(client, config.bucket, config.input_prefix)
    media_key = _resolve_media_key(data, objects, config.input_prefix)
    _validate_media_key(media_key, config.input_prefix)

    image = _decode_image(_read_object_bytes(client, config.bucket, media_key), media_key)
    rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    height, width = rgb_image.shape[:2]

    point_payload = data.get("point")
    box_payload = data.get("box")
    if not point_payload and not box_payload:
        raise ValueError("SAM assist requires either a click point or a bounding box.")

    processor, model, model_source, device = _load_sam_model()
    class_names = _class_names(str(session["usecase_slug"]))
    requested_class_name = str(
        data.get("class_name")
        or (box_payload or {}).get("class_name")
        or class_names[0]
    ).strip().lower()
    if requested_class_name and requested_class_name not in class_names:
        class_names.append(requested_class_name)

    processor_kwargs: dict[str, Any] = {}
    input_type = "point"
    if box_payload:
        processor_kwargs["input_boxes"] = _xyxy_from_normalized_box(box_payload, width, height)
        input_type = "box"
    elif point_payload:
        processor_kwargs["input_points"] = _pixel_point_from_normalized(point_payload, width, height)
        processor_kwargs["input_labels"] = [[1]]

    try:
        import torch
    except Exception as error:
        raise ValueError(f"SAM requires torch at runtime: {error}") from error

    inputs = processor(images=rgb_image, return_tensors="pt", **processor_kwargs)
    inputs = {key: value.to(device) if hasattr(value, "to") else value for key, value in inputs.items()}
    with torch.inference_mode():
        outputs = model(**inputs, multimask_output=True)

    processed_masks = processor.image_processor.post_process_masks(
        outputs.pred_masks.cpu(),
        inputs["original_sizes"].cpu(),
        inputs["reshaped_input_sizes"].cpu(),
    )
    raw_masks = processed_masks[0]
    mask_candidates = np.asarray(raw_masks)
    if mask_candidates.ndim == 4:
        mask_candidates = mask_candidates[0]
    elif mask_candidates.ndim == 2:
        mask_candidates = mask_candidates[None, ...]
    score_values = outputs.iou_scores.detach().cpu().numpy()
    score_candidates = np.asarray(score_values[0] if score_values.ndim > 1 else score_values).reshape(-1)
    best_index = int(score_candidates.argmax()) if score_candidates.size else 0
    selected_mask = np.asarray(mask_candidates[best_index] > 0, dtype=np.uint8)
    xyxy = _mask_to_xyxy(selected_mask)
    annotation = _annotation_from_xyxy(
        xyxy=xyxy,
        width=width,
        height=height,
        class_name=requested_class_name or class_names[0],
        class_names=class_names,
        confidence=float(score_candidates[best_index]) if score_candidates.size else 0.0,
        source="sam",
    )

    return {
        "session_id": int(session["id"]),
        "dataset_id": int(dataset["id"]),
        "annotation_format": "yolo",
        "model_source": model_source,
        "input_type": input_type,
        "media_object_key": media_key,
        "file_name": PurePosixPath(media_key).name,
        "mask_score": round(float(score_candidates[best_index]) if score_candidates.size else 0.0, 4),
        "mask_data_url": _mask_to_png_data_url(selected_mask),
        "bbox": annotation["bbox"],
        "annotation": annotation,
        "class_name": annotation["class_name"],
        "message": "SAM refinement is ready to review. Accept it to convert the mask into a bounding box.",
    }


def assist_label_dataset(session_id: int, payload: Any) -> dict[str, Any]:
    session, dataset = _session_and_selected_dataset(session_id)
    data = _payload_to_dict(payload)
    prompts = _prompt_terms(data.get("prompts"))
    limit = max(1, min(int(data.get("limit") or 24), 100))
    confidence = max(0.05, min(float(data.get("confidence") or 0.25), 0.95))

    config = _minio_config_for_dataset(dataset)
    client = create_client(config)
    validate_bucket_access(client, config.bucket)
    objects = _list_objects(client, config.bucket, config.input_prefix)
    label_index = _build_label_index(objects, client, config.bucket)
    if not label_index:
        raise ValueError("Label Assist needs at least one saved label. Manually label a few images first.")
    image_objects = sorted(
        [
            obj
            for obj in objects
            if PurePosixPath(str(obj.object_name)).suffix.lower() in IMAGE_EXTENSIONS
        ],
        key=lambda item: str(item.object_name),
    )
    if not image_objects:
        raise ValueError("No supported images were found for Label Assist.")

    class_names = _class_names(str(session["usecase_slug"]), prompts)
    predicted_items, model_source = _predict_annotations_for_images(
        client=client,
        bucket=config.bucket,
        image_objects=image_objects,
        class_names=class_names,
        prompts=prompts,
        confidence=confidence,
    )
    predictions_by_key = {str(item["media_object_key"]): item for item in predicted_items}
    prioritized_items: list[dict[str, Any]] = []
    review_status_counts = {"unlabeled": 0, "needs_review": 0, "completed": 0}
    priority_counts = {"high": 0, "medium": 0, "low": 0}

    for obj in image_objects:
        object_key = str(obj.object_name)
        saved_annotations, label_source = _load_saved_annotations(
            client,
            config.bucket,
            label_index,
            object_key,
            class_names,
        )
        prediction = predictions_by_key.get(
            object_key,
            {
                "item_id": object_key,
                "media_object_key": object_key,
                "file_name": PurePosixPath(object_key).name,
                "preview_url": build_presigned_get_url(
                    client,
                    config.bucket,
                    object_key,
                    settings.minio_presigned_expiry_minutes,
                ),
                "last_modified": obj.last_modified.isoformat() if getattr(obj, "last_modified", None) else None,
                "annotations": [],
                "suggestions": [],
                "suggestion_count": 0,
                "has_low_confidence_predictions": False,
                "has_medium_confidence_predictions": False,
            },
        )
        saved_annotation_count = len(saved_annotations)
        suggestion_count = len(prediction.get("annotations") or [])
        has_low_confidence_predictions = bool(prediction.get("has_low_confidence_predictions"))
        has_medium_confidence_predictions = bool(prediction.get("has_medium_confidence_predictions"))
        review_status = _review_status(
            has_saved_annotations=bool(saved_annotations),
            label_source=label_source,
            has_low_confidence_predictions=has_low_confidence_predictions,
            has_medium_confidence_predictions=has_medium_confidence_predictions,
        )
        priority_score, priority_tier, priority_reason = _priority_details(
            saved_annotation_count=saved_annotation_count,
            label_source=label_source,
            suggestion_count=suggestion_count,
            has_low_confidence_predictions=has_low_confidence_predictions,
            has_medium_confidence_predictions=has_medium_confidence_predictions,
        )
        prioritized_items.append(
            {
                "item_id": object_key,
                "media_object_key": object_key,
                "file_name": PurePosixPath(object_key).name,
                "preview_url": prediction["preview_url"],
                "last_modified": prediction.get("last_modified"),
                "has_label": bool(saved_annotations),
                "label_source": label_source,
                "annotation_count": saved_annotation_count,
                "saved_annotation_count": saved_annotation_count,
                "suggestion_count": suggestion_count,
                "has_low_confidence_predictions": has_low_confidence_predictions,
                "has_medium_confidence_predictions": has_medium_confidence_predictions,
                "review_status": review_status,
                "priority_score": priority_score,
                "priority_tier": priority_tier,
                "priority_reason": priority_reason,
                "annotations": prediction.get("annotations") or [],
                "suggestions": prediction.get("suggestions") or [],
            }
        )
        review_status_counts[review_status] = review_status_counts.get(review_status, 0) + 1
        priority_counts[priority_tier] = priority_counts.get(priority_tier, 0) + 1

    prioritized_items.sort(
        key=lambda item: (
            -int(item.get("priority_score") or 0),
            0 if item.get("review_status") == "unlabeled" else 1 if item.get("review_status") == "needs_review" else 2,
            -int(bool(item.get("has_low_confidence_predictions"))),
            str(item.get("file_name") or "").lower(),
        )
    )
    returned_items = prioritized_items[:limit]
    low_confidence_item_count = sum(1 for item in prioritized_items if item.get("has_low_confidence_predictions"))
    medium_confidence_item_count = sum(
        1
        for item in prioritized_items
        if not item.get("has_low_confidence_predictions") and item.get("has_medium_confidence_predictions")
    )
    suggested_item_count = sum(1 for item in returned_items if item.get("suggestion_count"))
    if low_confidence_item_count:
        focus_message = "Focus on reviewing low-confidence detections first."
    elif medium_confidence_item_count:
        focus_message = "Start with medium-confidence detections that need confirmation."
    elif review_status_counts.get("unlabeled"):
        focus_message = "Start with the unlabeled images surfaced at the top of the queue."
    else:
        focus_message = "Use the prioritized queue to double-check the most useful review items."
    return {
        "session_id": int(session["id"]),
        "dataset_id": int(dataset["id"]),
        "assist_status": "suggestions_ready",
        "annotation_format": "yolo",
        "model_source": model_source,
        "prompts": prompts,
        "labeled_seed_count": len(label_index),
        "processed_item_count": len(image_objects),
        "returned_item_count": len(returned_items),
        "suggested_label_count": suggested_item_count,
        "low_confidence_item_count": low_confidence_item_count,
        "medium_confidence_item_count": medium_confidence_item_count,
        "priority_strategy": "Unlabeled and uncertain images are ranked first for review.",
        "focus_message": focus_message,
        "priority_summary": {
            **priority_counts,
            **review_status_counts,
        },
        "classes": class_names,
        "items": returned_items,
        "finalized": False,
        "message": (
            f"Assist Mode prioritized {len(returned_items)} image(s) from {len(image_objects)} candidates. "
            f"{focus_message}"
        ),
    }


def train_assist_model(session_id: int) -> dict[str, Any]:
    session, dataset = _session_and_selected_dataset(session_id)
    config = _minio_config_for_dataset(dataset)
    client = create_client(config)
    validate_bucket_access(client, config.bucket)
    objects = _list_objects(client, config.bucket, config.input_prefix)

    preparation = _prepare_assist_training_dataset(
        session_id=session_id,
        session=session,
        dataset=dataset,
        client=client,
        config=config,
        objects=objects,
    )

    try:
        import torch
    except Exception:
        torch = None

    base_model, base_model_source = _load_assist_base_model()
    device = 0 if torch is not None and torch.cuda.is_available() else "cpu"
    run_name = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    run_dir = _assist_session_run_dir(session_id)
    run_dir.mkdir(parents=True, exist_ok=True)
    epochs = 15
    imgsz = 640
    batch_size = max(1, min(4, int(preparation["labeled_image_count"])))

    print(
        "[train-assist-model] preparing dataset",
        {
            "session_id": session_id,
            "labeled_images_used": int(preparation["labeled_image_count"]),
            "label_files_found": int(preparation["label_file_count"]),
            "class_names": list(preparation["class_names"]),
            "data_yaml_path": str(preparation["data_yaml_path"]),
            "dataset_dir": str(preparation["dataset_dir"]),
        },
    )
    print(
        "[train-assist-model] training assist model",
        {
            "session_id": session_id,
            "dataset_dir": str(preparation["dataset_dir"]),
            "data_yaml_path": str(preparation["data_yaml_path"]),
            "epochs": epochs,
            "device": device,
        },
    )
    try:
        results = base_model.train(
            data=str(preparation["data_yaml_path"]),
            epochs=epochs,
            imgsz=imgsz,
            device=device,
            project=str(run_dir),
            name=run_name,
            exist_ok=True,
            workers=0,
            batch=batch_size,
            patience=0,
            verbose=False,
            plots=False,
            save=True,
        )
    except Exception as error:
        raise ValueError(f"Assist model training failed: {error}") from error

    save_dir = Path(getattr(results, "save_dir", run_dir / run_name))
    weights_dir = save_dir / "weights"
    best_path = weights_dir / "best.pt"
    if not best_path.is_file():
        best_path = weights_dir / "last.pt"
    if not best_path.is_file():
        raise ValueError(f"Assist model training finished, but no weights file was found in {weights_dir}.")

    ASSIST_MODEL_DIR.mkdir(parents=True, exist_ok=True)
    final_model_path = _assist_session_model_path(session_id)
    shutil.copy2(best_path, final_model_path)
    _ASSIST_MODELS.pop(session_id, None)
    _ASSIST_MODEL_SOURCES.pop(session_id, None)
    print(
        "[train-assist-model] completed",
        {
            "session_id": session_id,
            "best_weights_path": str(best_path),
            "final_best_path": str(final_model_path),
        },
    )

    warning = preparation.get("warning") or ""
    warning_classes = preparation.get("low_coverage_classes") or []
    return {
        "session_id": int(session["id"]),
        "dataset_id": int(dataset["id"]),
        "dataset_name": str(dataset["name"]),
        "assist_training_status": "model_ready",
        "demo_mode": True,
        "assist_model_path": str(final_model_path),
        "assist_dataset_path": str(preparation["dataset_dir"]),
        "data_yaml_path": str(preparation["data_yaml_path"]),
        "base_model": base_model_source,
        "epochs": epochs,
        "imgsz": imgsz,
        "device": str(device),
        "label_file_count": int(preparation["label_file_count"]),
        "labeled_images": int(preparation["labeled_image_count"]),
        "train_images": int(preparation["train_images"]),
        "val_images": int(preparation["val_images"]),
        "labeled_objects": int(preparation["labeled_object_count"]),
        "class_names": list(preparation["class_names"]),
        "class_image_counts": dict(preparation["class_image_counts"]),
        "label_source_counts": dict(preparation["label_source_counts"]),
        "warning": warning,
        "warning_classes": warning_classes,
        "recommended_next_action": "Label remaining images",
        "message": (
            f"Assist model trained from {preparation['labeled_image_count']} labeled image(s). "
            "Use Label remaining images to generate suggestions for the unlabeled part of the dataset."
        ),
    }


def assist_propagate_dataset(session_id: int, payload: Any) -> dict[str, Any]:
    session, dataset = _session_and_selected_dataset(session_id)
    data = _payload_to_dict(payload)
    prompts = _prompt_terms(data.get("prompts"))
    limit = max(1, min(int(data.get("limit") or 48), 200))
    requested_confidence = max(0.05, min(float(data.get("confidence") or 0.10), 0.95))
    confidence = min(requested_confidence, 0.10)

    config = _minio_config_for_dataset(dataset)
    client = create_client(config)
    validate_bucket_access(client, config.bucket)
    objects = _list_objects(client, config.bucket, config.input_prefix)
    saved_label_index = _build_export_label_index(objects, client, config.bucket)
    assist_model, model_source = _load_session_assist_model(session_id)
    assist_model_path = _assist_session_model_path(session_id)
    model_names = getattr(assist_model, "names", {})
    print(
        "[assist-propagate] starting",
        {
            "session_id": session_id,
            "assist_model_path": str(assist_model_path),
            "model_names": model_names,
            "confidence_threshold_used": confidence,
            "requested_confidence": requested_confidence,
        },
    )

    image_objects = sorted(
        [
            obj
            for obj in objects
            if PurePosixPath(str(obj.object_name)).suffix.lower() in IMAGE_EXTENSIONS
            and PurePosixPath(str(obj.object_name)).stem not in saved_label_index
        ],
        key=lambda item: str(item.object_name),
    )
    print(
        "[assist-propagate] unlabeled pool",
        {
            "session_id": session_id,
            "labeled_images": len(saved_label_index),
            "unlabeled_images": len(image_objects),
        },
    )
    if not image_objects:
        return {
            "session_id": int(session["id"]),
            "dataset_id": int(dataset["id"]),
            "assist_status": "no_unlabeled_images",
            "annotation_format": "yolo",
            "model_source": model_source,
            "assist_model_path": str(assist_model_path),
            "model_names": model_names,
            "confidence_threshold_used": confidence,
            "processed_item_count": 0,
            "returned_item_count": 0,
            "suggested_label_count": 0,
            "classes": _class_names(str(session["usecase_slug"]), prompts),
            "items": [],
            "finalized": False,
            "message": "Every image already has a saved label file. There are no remaining unlabeled images to propagate.",
        }

    class_names = _resolve_export_class_names(
        client,
        config.bucket,
        config.input_prefix,
        str(session["usecase_slug"]),
        _build_assist_training_label_index(objects, client, config.bucket),
    )
    for prompt in prompts:
        if prompt not in class_names:
            class_names.append(prompt)

    predicted_items, _ = _predict_annotations_for_images(
        client=client,
        bucket=config.bucket,
        image_objects=image_objects,
        class_names=class_names,
        prompts=prompts,
        confidence=confidence,
        mode="yolo",
        model_override=assist_model,
        model_source_override=model_source,
        debug_context="assist-propagate",
    )
    predictions_by_key = {str(item["media_object_key"]): item for item in predicted_items}
    raw_detection_total = sum(int(item.get("raw_detection_count") or 0) for item in predicted_items)
    filtered_detection_total = sum(int(item.get("filtered_detection_count") or 0) for item in predicted_items)
    print(
        "[assist-propagate] detection summary",
        {
            "session_id": session_id,
            "raw_detections_before_filtering": raw_detection_total,
            "detections_after_filtering": filtered_detection_total,
            "confidence_threshold_used": confidence,
        },
    )
    prioritized_items: list[dict[str, Any]] = []
    review_status_counts = {"unlabeled": 0, "needs_review": 0, "completed": 0}
    priority_counts = {"high": 0, "medium": 0, "low": 0}

    for obj in image_objects:
        object_key = str(obj.object_name)
        prediction = predictions_by_key.get(
            object_key,
            {
                "item_id": object_key,
                "media_object_key": object_key,
                "file_name": PurePosixPath(object_key).name,
                "preview_url": build_presigned_get_url(
                    client,
                    config.bucket,
                    object_key,
                    settings.minio_presigned_expiry_minutes,
                ),
                "last_modified": obj.last_modified.isoformat() if getattr(obj, "last_modified", None) else None,
                "annotations": [],
                "suggestions": [],
                "suggestion_count": 0,
                "has_low_confidence_predictions": False,
                "has_medium_confidence_predictions": False,
            },
        )
        suggestion_count = len(prediction.get("annotations") or [])
        has_low_confidence_predictions = bool(prediction.get("has_low_confidence_predictions"))
        has_medium_confidence_predictions = bool(prediction.get("has_medium_confidence_predictions"))
        review_status = (
            "needs_review"
            if suggestion_count
            else "unlabeled"
        )
        priority_score, priority_tier, priority_reason = _priority_details(
            saved_annotation_count=0,
            label_source=None,
            suggestion_count=suggestion_count,
            has_low_confidence_predictions=has_low_confidence_predictions,
            has_medium_confidence_predictions=has_medium_confidence_predictions,
        )
        prioritized_items.append(
            {
                "item_id": object_key,
                "media_object_key": object_key,
                "file_name": PurePosixPath(object_key).name,
                "preview_url": prediction["preview_url"],
                "last_modified": prediction.get("last_modified"),
                "has_label": False,
                "label_source": None,
                "annotation_count": 0,
                "saved_annotation_count": 0,
                "suggestion_count": suggestion_count,
                "has_low_confidence_predictions": has_low_confidence_predictions,
                "has_medium_confidence_predictions": has_medium_confidence_predictions,
                "review_status": review_status,
                "priority_score": priority_score,
                "priority_tier": priority_tier,
                "priority_reason": priority_reason,
                "annotations": prediction.get("annotations") or [],
                "suggestions": prediction.get("suggestions") or [],
            }
        )
        review_status_counts[review_status] = review_status_counts.get(review_status, 0) + 1
        priority_counts[priority_tier] = priority_counts.get(priority_tier, 0) + 1

    prioritized_items.sort(
        key=lambda item: (
            -int(item.get("priority_score") or 0),
            -int(bool(item.get("has_low_confidence_predictions"))),
            str(item.get("file_name") or "").lower(),
        )
    )
    returned_items = prioritized_items[:limit]
    suggested_item_count = sum(1 for item in returned_items if item.get("suggestion_count"))
    low_confidence_item_count = sum(1 for item in returned_items if item.get("has_low_confidence_predictions"))
    medium_confidence_item_count = sum(
        1
        for item in returned_items
        if not item.get("has_low_confidence_predictions") and item.get("has_medium_confidence_predictions")
    )
    if not suggested_item_count:
        return {
            "session_id": int(session["id"]),
            "dataset_id": int(dataset["id"]),
            "assist_status": "no_detections",
            "annotation_format": "yolo",
            "model_source": model_source,
            "assist_model_path": str(assist_model_path),
            "model_names": model_names,
            "confidence_threshold_used": confidence,
            "processed_item_count": len(image_objects),
            "returned_item_count": len(returned_items),
            "suggested_label_count": 0,
            "low_confidence_item_count": 0,
            "medium_confidence_item_count": 0,
            "raw_detection_count": raw_detection_total,
            "filtered_detection_count": filtered_detection_total,
            "classes": class_names,
            "items": returned_items,
            "priority_summary": {
                **priority_counts,
                **review_status_counts,
            },
            "finalized": False,
            "message": (
                "Assist model trained successfully, but produced no detections. "
                "Try more labeled images, lower confidence, or use YOLO/Prompt-based auto-label."
            ),
        }

    focus_message = (
        "Focus on reviewing low-confidence propagated detections first."
        if low_confidence_item_count
        else "Review the propagated suggestions and save the accepted labels."
    )
    return {
        "session_id": int(session["id"]),
        "dataset_id": int(dataset["id"]),
        "assist_status": "suggestions_ready",
        "annotation_format": "yolo",
        "model_source": model_source,
        "assist_model_path": str(assist_model_path),
        "model_names": model_names,
        "confidence_threshold_used": confidence,
        "processed_item_count": len(image_objects),
        "returned_item_count": len(returned_items),
        "suggested_label_count": suggested_item_count,
        "low_confidence_item_count": low_confidence_item_count,
        "medium_confidence_item_count": medium_confidence_item_count,
        "raw_detection_count": raw_detection_total,
        "filtered_detection_count": filtered_detection_total,
        "priority_strategy": "Remaining unlabeled images are prioritized after training a local assist model on saved labels.",
        "focus_message": focus_message,
        "priority_summary": {
            **priority_counts,
            **review_status_counts,
        },
        "classes": class_names,
        "items": returned_items,
        "finalized": False,
        "message": (
            f"Suggestions are ready for {suggested_item_count} remaining image(s) using the session assist model. "
            "Review, edit, and save them before they become ground-truth labels."
        ),
    }


def export_selected_dataset_to_yolo(session_id: int) -> dict[str, Any]:
    session, dataset = _session_and_selected_dataset(session_id)
    config = _minio_config_for_dataset(dataset)
    client = create_client(config)
    validate_bucket_access(client, config.bucket)

    objects = _list_objects(client, config.bucket, config.input_prefix)
    image_objects = [
        obj
        for obj in objects
        if PurePosixPath(str(obj.object_name)).suffix.lower() in IMAGE_EXTENSIONS
    ]
    if not image_objects:
        raise ValueError("No supported images were found in the selected dataset.")

    label_index = _build_export_label_index(objects, client, config.bucket)
    class_names = _resolve_export_class_names(
        client,
        config.bucket,
        config.input_prefix,
        str(session["usecase_slug"]),
        label_index,
    )
    media_keys = [str(obj.object_name) for obj in image_objects]
    train_keys, val_keys = _split_export_media_keys(media_keys)

    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    dataset_slug = _slugify_path_component(str(dataset.get("name") or f"dataset-{dataset['id']}"), f"dataset-{dataset['id']}")
    export_dir = (
        YOLO_EXPORTS_DIR
        / f"session-{int(session['id'])}"
        / f"dataset-{int(dataset['id'])}-{dataset_slug}-{timestamp}"
    )
    for relative_dir in ["images/train", "images/val", "labels/train", "labels/val"]:
        (export_dir / relative_dir).mkdir(parents=True, exist_ok=True)

    labeled_images = 0
    missing_labels = 0
    label_source_counts = {"manual": 0, "imported": 0, "existing": 0}

    split_lookup = {key: "train" for key in train_keys}
    split_lookup.update({key: "val" for key in val_keys})

    for media_key in sorted(media_keys):
        split = split_lookup.get(media_key, "train")
        export_stem = _export_image_stem(media_key, config.input_prefix)
        image_suffix = PurePosixPath(media_key).suffix.lower()
        image_path = export_dir / "images" / split / f"{export_stem}{image_suffix}"
        image_path.write_bytes(_read_object_bytes(client, config.bucket, media_key))

        label_record = label_index.get(PurePosixPath(media_key).stem)
        if not label_record:
            missing_labels += 1
            continue

        label_path = export_dir / "labels" / split / f"{export_stem}.txt"
        label_path.write_bytes(_read_object_bytes(client, config.bucket, label_record["object_key"]))
        labeled_images += 1
        source = str(label_record.get("source") or "existing")
        if source in label_source_counts:
            label_source_counts[source] += 1

    data_yaml_path = _write_yolo_data_yaml(export_dir, class_names)
    total_images = len(media_keys)
    summary = {
        "total_images": total_images,
        "train_images": len(train_keys),
        "val_images": len(val_keys),
        "labeled_images": labeled_images,
        "missing_labels": missing_labels,
        "class_names": class_names,
    }
    return {
        "session_id": int(session["id"]),
        "dataset_id": int(dataset["id"]),
        "dataset_name": str(dataset["name"]),
        "export_status": "ready",
        "annotation_format": "yolo",
        "export_path": str(export_dir),
        "data_yaml_path": str(data_yaml_path),
        **summary,
        "summary": summary,
        "label_source_priority": ["manual", "imported", "existing"],
        "label_source_counts": label_source_counts,
        "message": (
            f"Exported {total_images} image(s) to {export_dir}. "
            f"Manual labels were preferred, imported labels filled remaining gaps, and pending suggestions were ignored."
        ),
    }
