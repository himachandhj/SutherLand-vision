from __future__ import annotations

from pathlib import Path, PurePosixPath
from typing import Any

from app.core.config import settings
from app.core.database import (
    complete_dataset_audit,
    create_dataset_audit,
    create_fine_tuning_session,
    ensure_default_model_version,
    get_active_model_version,
    get_dataset,
    get_dataset_audit,
    get_fine_tuning_session,
    get_latest_dataset,
    get_latest_dataset_audit,
    get_latest_dataset_audit_for_dataset,
    get_open_fine_tuning_session,
    update_dataset_audit_summary,
    update_fine_tuning_session,
    upsert_default_dataset,
)
from app.services.dataset_label_status import compute_label_status, label_coverage
from app.core.minio_integration import (
    MinioConnectionConfig,
    create_client,
    normalize_prefix,
    validate_bucket_access,
)


SUPPORTED_MEDIA_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".bmp",
    ".webp",
    ".mp4",
    ".avi",
    ".mov",
    ".mkv",
    ".webm",
}
LABEL_EXTENSIONS = {".txt", ".json", ".xml", ".csv", ".yaml", ".yml"}

USECASE_DATASET_PREFIXES = {
    "ppe-detection": "ppe/input/",
    "region-alerts": "region/input/",
    "fire-detection": "fire/input/",
    "crack-detection": "crack/input/",
    "unsafe-behavior-detection": "unsafe_behavior/input/",
    "speed-estimation": "speed/input/",
    "queue-management": "queue/input/",
    "class-wise-object-counting": "counting/input/",
    "class-wise-counting": "counting/input/",
    "object-tracking": "tracking/input/",
}

BACKEND_DIR = Path(__file__).resolve().parents[2]
USECASE_STEP_ONE_METADATA = {
    "crack-detection": {
        "display_name": "Crack Detection",
        "task_type": "object_detection",
        "annotation_format": "yolo",
        "classes": ["crack"],
        "current_model_path": "models/crack_detection/best.pt",
        "title": "Tune Crack Detection",
        "subtitle": "Check whether your crack dataset, labels, and current crack detector are ready before training setup.",
    },
    "unsafe-behavior-detection": {
        "display_name": "Unsafe Behavior Detection",
        "task_type": "object_detection",
        "annotation_format": "yolo",
        "classes": ["smoking", "phone_usage"],
        "current_model_path": "models/unsafe_behavior/smoking_best.pt",
        "title": "Tune Unsafe Behavior Detection",
        "subtitle": "Check workplace data, labeling readiness, and the installed smoking detector before training setup. Phone usage currently uses a rule-based COCO person and phone association during inference.",
        "model_note": "Phone usage currently relies on COCO person + cell phone association. Fine-tuning in this flow prepares smoking and phone_usage event labels only.",
    },
}


def _default_dataset_prefix(usecase_slug: str) -> str:
    return normalize_prefix(
        USECASE_DATASET_PREFIXES.get(usecase_slug, settings.minio_input_prefix),
        "input/",
    )


def _minio_config_for_dataset(dataset: dict) -> MinioConnectionConfig:
    return MinioConnectionConfig(
        endpoint=settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        bucket=str(dataset.get("minio_bucket") or settings.minio_bucket),
        input_prefix=str(dataset.get("minio_prefix") or settings.minio_input_prefix),
        output_prefix=settings.minio_output_prefix,
        secure=settings.minio_secure,
    )


def _readiness_status(score: int) -> str:
    if score >= 85:
        return "ready"
    if score >= 70:
        return "mostly_ready"
    if score >= 50:
        return "needs_cleanup"
    return "not_ready"


def _recommended_action(score: int, dataset: dict | None, audit: dict | None) -> str:
    if not dataset:
        return "Review the safe fine-tuning path, then choose or register data in Step 2."
    if not audit:
        return "Run data check before continuing setup."
    if score >= 85:
        return "Dataset looks ready. Continue to setup."
    if score >= 70:
        return "Dataset is mostly ready. Review warnings before setup."
    if score >= 50:
        return "Clean up dataset issues before training setup."
    return "Dataset is not ready. Add supported files and labels before continuing."


def ensure_step_one_session(usecase_slug: str) -> dict[str, Any]:
    model = ensure_default_model_version(usecase_slug=usecase_slug)
    dataset = get_latest_dataset(usecase_slug)
    if dataset is None:
        upsert_default_dataset(
            usecase_slug=usecase_slug,
            name=f"{usecase_slug.replace('-', ' ').title()} MinIO dataset",
            source_type="minio",
            minio_bucket=settings.minio_bucket,
            minio_prefix=_default_dataset_prefix(usecase_slug),
            media_type="mixed",
        )

    session = get_open_fine_tuning_session(usecase_slug)
    if session is None:
        session = create_fine_tuning_session(
            usecase_slug=usecase_slug,
            starting_model_name=str(model["version_name"]),
            selected_dataset_id=None,
            recommended_next_action=_recommended_action(0, None, None),
        )
    elif not session.get("starting_model_name"):
        session = update_fine_tuning_session(
            int(session["id"]),
            starting_model_name=session.get("starting_model_name") or model["version_name"],
        )

    return session


def build_step_one_response(usecase_slug: str) -> dict[str, Any]:
    session = ensure_step_one_session(usecase_slug)
    model = get_active_model_version(usecase_slug) or ensure_default_model_version(usecase_slug=usecase_slug)
    metadata = USECASE_STEP_ONE_METADATA.get(usecase_slug, {})
    dataset = get_dataset(int(session["selected_dataset_id"])) if session.get("selected_dataset_id") else None
    if session.get("selected_dataset_id") and dataset is None:
        session = update_fine_tuning_session(
            int(session["id"]),
            selected_dataset_id=None,
            readiness_score=None,
            recommended_next_action=_recommended_action(0, None, None),
        )
    latest_audit = (
        get_latest_dataset_audit_for_dataset(
            dataset_id=int(dataset["id"]),
            session_id=int(session["id"]),
            completed_only=True,
        )
        if dataset
        else None
    )
    live_check = None
    if dataset and latest_audit is None and dataset.get("source_type") == "minio":
        try:
            live_check = inspect_minio_dataset(dataset)
            dataset = update_dataset_audit_summary(
                int(dataset["id"]),
                file_count=int(live_check["summary"].get("file_count", 0)),
                label_status=str(live_check["summary"].get("label_status", "unknown")),
                audit_status=str(dataset.get("audit_status") or "not_run"),
            )
        except Exception:
            live_check = None

    audit_summary = latest_audit.get("summary_json", {}) if latest_audit else (live_check.get("summary", {}) if live_check else {})
    file_count = int(
        audit_summary.get("file_count", audit_summary.get("supported_file_count"))
        if isinstance(audit_summary, dict)
        else (dataset.get("file_count") or 0)
    ) if dataset else 0
    label_status = (
        str(audit_summary.get("label_status") or dataset.get("label_status") or "unknown")
        if dataset
        else "missing"
    )
    if file_count <= 0:
        label_status = "missing"

    readiness_score = int(
        latest_audit.get("readiness_score")
        if latest_audit and latest_audit.get("readiness_score") is not None
        else live_check.get("readiness_score")
        if live_check
        else 0
    )
    if dataset and file_count <= 0:
        readiness_score = 0
    recommended_next_action = _recommended_action(readiness_score, dataset, latest_audit)
    selected_dataset_id = int(session["selected_dataset_id"]) if session.get("selected_dataset_id") else None

    if session.get("readiness_score") != readiness_score or session.get("recommended_next_action") != recommended_next_action:
        session = update_fine_tuning_session(
            int(session["id"]),
            readiness_score=readiness_score,
            recommended_next_action=recommended_next_action,
        )

    issues = latest_audit.get("issues_json", []) if latest_audit else (live_check.get("issues", []) if live_check else [])
    current_model_path = metadata.get("current_model_path") or str(model.get("model_path") or "yolov8n.pt")
    model_available = Path(BACKEND_DIR / current_model_path).is_file() if current_model_path and not current_model_path.startswith("yolo") else True
    model_warnings = []
    if not model_available:
        model_warnings.append(f"Current model is not installed at {current_model_path}. Manual labeling still works.")
    starting_model_name = model.get("version_name", "YOLOv8n baseline")
    if usecase_slug == "crack-detection":
        starting_model_name = "Crack detector" if model_available else "Crack detector unavailable"
    elif usecase_slug == "unsafe-behavior-detection":
        starting_model_name = "Unsafe smoking detector" if model_available else "Unsafe smoking detector unavailable"

    return {
        "use_case_id": usecase_slug,
        "display_name": metadata.get("display_name") or usecase_slug.replace("-", " ").title(),
        "task_type": metadata.get("task_type") or "object_detection",
        "annotation_format": metadata.get("annotation_format") or "yolo",
        "classes": metadata.get("classes") or [],
        "current_model_path": current_model_path,
        "model_available": model_available,
        "warnings": model_warnings,
        "model_warning": model_warnings[0] if model_warnings else "",
        "model_note": metadata.get("model_note") or "",
        "session_id": int(session["id"]),
        "current_step": int(session.get("current_step") or 1),
        "selected_dataset_id": selected_dataset_id,
        "resume_message": f"Resuming previous setup: {dataset['name']}" if dataset and selected_dataset_id else "",
        "step": 1,
        "title": metadata.get("title") or "Get started with fine-tuning",
        "subtitle": metadata.get("subtitle") or "Check whether your examples, labels, and baseline model are ready before setup.",
        "guidance_cards": [
            {
                "title": "Bring examples",
                "description": "Use representative images or videos from the same camera conditions where the model will run.",
            },
            {
                "title": "Check labels",
                "description": "Make sure labels exist and match the objects or events you want the model to learn.",
            },
            {
                "title": "Compare first",
                "description": "Keep the current production model as the baseline for future quality comparison.",
            },
        ],
        "summary_cards": {
            "data_readiness": {
                "label": "Data readiness",
                "score": readiness_score if dataset else None,
                "status": (
                    "not_selected"
                    if not dataset
                    else "invalid" if file_count <= 0 else (_readiness_status(readiness_score) if latest_audit or live_check else "not_checked")
                ),
                "file_count": file_count,
                "label_status": label_status,
                "issues_count": len(issues),
                "dataset": {
                    "id": selected_dataset_id,
                    "name": dataset.get("name") if dataset else "No dataset selected yet",
                    "source_type": dataset.get("source_type") if dataset else "",
                    "minio_bucket": dataset.get("minio_bucket") if dataset else "",
                    "minio_prefix": dataset.get("minio_prefix") if dataset else "",
                },
            },
            "safety": {
                "label": "Safety summary",
                "status": "review_needed" if issues else ("not_checked" if not latest_audit else "clear"),
                "issues": issues[:5],
                "recommendations": (latest_audit.get("recommendations_json", []) if latest_audit else (live_check.get("recommendations", []) if live_check else []))[:5],
            },
            "starting_model": {
                "label": "Starting model",
                "name": starting_model_name,
                "role": model.get("role", "production"),
                "is_active": bool(model.get("is_active")),
                "model_path": current_model_path,
                "model_available": model_available,
                "warning": model_warnings[0] if model_warnings else "",
                "quality_score": model.get("quality_score"),
                "latency_ms": model.get("latency_ms"),
                "false_alarm_rate": model.get("false_alarm_rate"),
            },
        },
        "data_check_summary": audit_summary,
        "recommended_next_action": recommended_next_action,
        "actions": {
            "can_run_data_check": bool(dataset),
            "can_start_setup": bool((latest_audit or live_check) and file_count > 0 and readiness_score >= 70),
            "can_continue": bool(selected_dataset_id or int(session.get("current_step") or 1) > 1),
        },
    }


def start_data_check(session_id: int) -> dict[str, Any]:
    session = get_fine_tuning_session(session_id)
    if not session:
        raise ValueError("Fine-tuning session not found.")

    dataset_id = session.get("selected_dataset_id")
    dataset = get_dataset(int(dataset_id)) if dataset_id else None
    if not dataset:
        raise ValueError("No dataset is selected for this fine-tuning session.")

    audit = create_dataset_audit(dataset_id=int(dataset["id"]), session_id=session_id, status="running")
    update_dataset_audit_summary(int(dataset["id"]), file_count=int(dataset.get("file_count") or 0), label_status=str(dataset.get("label_status") or "unknown"), audit_status="running")
    return audit


def run_dataset_audit(audit_id: int) -> None:
    audit = get_dataset_audit(audit_id)
    if not audit:
        return

    dataset = get_dataset(int(audit["dataset_id"]))
    session = get_fine_tuning_session(int(audit["session_id"]))
    if not dataset or not session:
        return

    try:
        result = inspect_minio_dataset(dataset)
        status = _readiness_status(result["readiness_score"])
        completed = complete_dataset_audit(
            audit_id,
            status=status,
            readiness_score=result["readiness_score"],
            issues=result["issues"],
            recommendations=result["recommendations"],
            summary=result["summary"],
        )
        update_dataset_audit_summary(
            int(dataset["id"]),
            file_count=int(result["summary"].get("file_count", 0)),
            label_status=str(result["summary"].get("label_status", "unknown")),
            audit_status=status,
        )
        update_fine_tuning_session(
            int(session["id"]),
            readiness_score=int(completed["readiness_score"]),
            recommended_next_action=_recommended_action(int(completed["readiness_score"]), dataset, completed),
        )
    except Exception as error:
        issues = [{"code": "audit_failed", "message": str(error), "severity": "high"}]
        recommendations = [{"code": "check_minio_settings", "message": "Verify MinIO credentials, bucket, and prefix configuration."}]
        complete_dataset_audit(
            audit_id,
            status="failed",
            readiness_score=0,
            issues=issues,
            recommendations=recommendations,
            summary={"error": str(error)},
        )
        update_dataset_audit_summary(int(dataset["id"]), file_count=int(dataset.get("file_count") or 0), label_status=str(dataset.get("label_status") or "unknown"), audit_status="failed")
        update_fine_tuning_session(int(session["id"]), readiness_score=0, recommended_next_action="Fix MinIO access or dataset configuration, then run data check again.")


def inspect_minio_dataset(dataset: dict) -> dict[str, Any]:
    if dataset.get("source_type") != "minio":
        return {
            "readiness_score": 0,
            "issues": [{"code": "unsupported_source", "message": "Only MinIO datasets are supported in Part 1.", "severity": "high"}],
            "recommendations": [{"code": "use_minio", "message": "Register this dataset with a MinIO bucket and prefix."}],
            "summary": {"file_count": 0, "label_status": "missing"},
        }

    config = _minio_config_for_dataset(dataset).normalized()
    client = create_client(config)
    validate_bucket_access(client, config.bucket)

    prefix = normalize_prefix(str(dataset.get("minio_prefix") or ""), "")
    objects = list(client.list_objects(config.bucket, prefix=prefix, recursive=True))
    file_objects = [obj for obj in objects if not getattr(obj, "is_dir", False)]

    media_files = []
    label_files = []
    unsupported_files = []
    zero_size_files = []
    filename_counts: dict[str, int] = {}
    etag_counts: dict[str, int] = {}

    for obj in file_objects:
        object_name = str(obj.object_name)
        path = PurePosixPath(object_name)
        suffix = path.suffix.lower()
        size = int(getattr(obj, "size", 0) or 0)
        filename_counts[path.name] = filename_counts.get(path.name, 0) + 1
        etag = str(getattr(obj, "etag", "") or "")
        if etag:
            etag_counts[etag] = etag_counts.get(etag, 0) + 1
        if size <= 0:
            zero_size_files.append(object_name)
        if suffix in LABEL_EXTENSIONS:
            label_files.append(object_name)
        elif suffix in SUPPORTED_MEDIA_EXTENSIONS:
            media_files.append(object_name)
        else:
            unsupported_files.append(object_name)

    duplicate_names = [name for name, count in filename_counts.items() if count > 1]
    duplicate_hashes = [etag for etag, count in etag_counts.items() if count > 1]
    file_count = len(media_files)
    total_files = len(file_objects)
    supported_ratio = (file_count / total_files) if total_files else 0
    corrupt_ratio = (len(zero_size_files) / max(total_files, 1))
    duplicate_ratio = ((len(duplicate_names) + len(duplicate_hashes)) / max(total_files, 1))
    labels_found = len(label_files) > 0
    enough_files = file_count >= 20

    score = 0
    score += 15  # bucket accessible
    score += 15 if total_files > 0 else 0
    score += round(20 * supported_ratio)
    score += max(0, 15 - round(corrupt_ratio * 15))
    score += 15 if labels_found else 0
    score += max(0, 10 - round(duplicate_ratio * 10))
    score += 10 if enough_files else round(min(file_count / 20, 1) * 10)
    score = max(0, min(100, int(score)))

    label_status = compute_label_status(file_count, len(label_files))
    issues = []
    recommendations = []
    if total_files == 0:
        issues.append({"code": "empty_prefix", "message": "No files were found under the configured MinIO prefix.", "severity": "high"})
        recommendations.append({"code": "add_examples", "message": "Upload representative images or videos before setup."})
    if unsupported_files:
        issues.append({"code": "unsupported_files", "message": f"{len(unsupported_files)} unsupported files found.", "severity": "medium"})
        recommendations.append({"code": "remove_unsupported", "message": "Keep only supported image/video files and label files in the dataset prefix."})
    if zero_size_files:
        issues.append({"code": "empty_files", "message": f"{len(zero_size_files)} zero-size files found.", "severity": "high"})
        recommendations.append({"code": "replace_empty_files", "message": "Remove or replace zero-size files before training."})
    if not labels_found:
        issues.append({"code": "labels_missing", "message": "No label files were found.", "severity": "high"})
        recommendations.append({"code": "add_labels", "message": "Add labels before fine-tuning."})
    if duplicate_names or duplicate_hashes:
        issues.append({"code": "possible_duplicates", "message": "Possible duplicate files were found by filename or object etag.", "severity": "medium"})
        recommendations.append({"code": "deduplicate", "message": "Review duplicate files so the dataset does not overweight repeated examples."})
    if not enough_files:
        issues.append({"code": "low_file_count", "message": f"Only {file_count} supported media files found.", "severity": "medium"})
        recommendations.append({"code": "add_more_examples", "message": "Aim for at least 20 examples before initial setup; more will be needed for stronger fine-tuning."})

    summary = {
        "bucket_accessible": True,
        "prefix_exists": total_files > 0,
        "bucket": config.bucket,
        "prefix": prefix,
        "file_count": file_count,
        "total_objects": total_files,
        "supported_file_count": file_count,
        "unsupported_file_count": len(unsupported_files),
        "label_file_count": len(label_files),
        "label_coverage": round(label_coverage(file_count, len(label_files)), 4),
        "label_status": label_status,
        "zero_size_file_count": len(zero_size_files),
        "duplicate_filename_count": len(duplicate_names),
        "duplicate_hash_count": len(duplicate_hashes),
        "readiness_status": _readiness_status(score),
    }
    return {
        "readiness_score": score,
        "issues": issues,
        "recommendations": recommendations,
        "summary": summary,
    }


def get_data_check_status(session_id: int) -> dict[str, Any]:
    session = get_fine_tuning_session(session_id)
    if not session:
        raise ValueError("Fine-tuning session not found.")
    dataset_id = session.get("selected_dataset_id")
    audit = (
        get_latest_dataset_audit_for_dataset(dataset_id=int(dataset_id), session_id=session_id)
        if dataset_id
        else get_latest_dataset_audit(session_id=session_id)
    )
    if not audit:
        return {"session_id": session_id, "status": "not_started"}
    response = {
        "session_id": session_id,
        "audit_id": int(audit["id"]),
        "status": audit["status"],
        "created_at": audit["created_at"],
        "completed_at": audit.get("completed_at"),
    }
    if audit["status"] != "running":
        response.update(
            {
                "readiness_score": audit.get("readiness_score"),
                "issues": audit.get("issues_json", []),
                "recommendations": audit.get("recommendations_json", []),
                "summary": audit.get("summary_json", {}),
            }
        )
    return response


def start_setup(session_id: int) -> dict[str, Any]:
    session = get_fine_tuning_session(session_id)
    if not session:
        raise ValueError("Fine-tuning session not found.")
    if not session.get("starting_model_name"):
        model = ensure_default_model_version(usecase_slug=str(session["usecase_slug"]))
        session["starting_model_name"] = model["version_name"]
    updated = update_fine_tuning_session(
        session_id,
        status="setup_started",
        current_step=2,
        starting_model_name=session.get("starting_model_name"),
        recommended_next_action="Continue to dataset and training setup.",
    )
    # TODO Parts 2-7: connect this handoff to dataset selection, labeling review,
    # training configuration, training run execution, evaluation, and promotion.
    return {"success": True, "session_id": session_id, "current_step": updated["current_step"], "status": updated["status"]}


def start_new_setup(session_id: int) -> dict[str, Any]:
    session = get_fine_tuning_session(session_id)
    if not session:
        raise ValueError("Fine-tuning session not found.")
    if not session.get("starting_model_name"):
        model = ensure_default_model_version(usecase_slug=str(session["usecase_slug"]))
        session["starting_model_name"] = model["version_name"]
    updated = update_fine_tuning_session(
        session_id,
        status="draft",
        current_step=1,
        selected_dataset_id=None,
        readiness_score=None,
        starting_model_name=session.get("starting_model_name"),
        recommended_next_action=_recommended_action(0, None, None),
    )
    return {
        "success": True,
        "session_id": session_id,
        "current_step": int(updated["current_step"]),
        "status": updated["status"],
        "selected_dataset_id": updated.get("selected_dataset_id"),
    }
