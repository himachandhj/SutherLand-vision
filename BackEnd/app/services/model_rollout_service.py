from pathlib import Path
from typing import Any

from app.models.model_version import (
    create_model_version,
    get_active_model,
    get_latest_model_version_for_job,
    get_model_version,
    get_promoted_model_version,
    get_staging_model_version,
    update_model_version_status,
    update_use_case_versions_status,
    upsert_active_model,
)
from app.models.training_job import get_training_job


BASE_DIR = Path(__file__).resolve().parents[2]
ALLOWED_ROLLOUT_JOB_STATUS = "completed"


class ModelRolloutError(Exception):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def save_candidate_version(job_id: str) -> dict[str, Any]:
    job = _get_completed_training_job(job_id)
    existing_version = get_latest_model_version_for_job(job_id)
    if existing_version is not None:
        return {
            "model_version_id": str(existing_version["id"]),
            "status": str(existing_version["status"]),
            "model_path": str(existing_version["model_path"]),
            "version_name": str(existing_version["version_name"]),
            "message": "Candidate version already exists for this training job.",
            "use_case_id": str(existing_version["use_case_id"]),
        }

    version = create_model_version(
        training_job_id=str(job["id"]),
        use_case_id=str(job["use_case_id"]),
        model_path=str(job["output_model_path"]),
        version_name=_build_version_name(job),
        status="candidate",
        metadata_json={
            "session_id": job.get("session_id"),
            "dataset_version_id": job.get("dataset_version_id"),
            "task_type": job.get("task_type"),
            "base_model": job.get("base_model"),
            "plan_config": job.get("plan_config") or {},
        },
    )
    return {
        "model_version_id": str(version["id"]),
        "status": str(version["status"]),
        "model_path": str(version["model_path"]),
        "version_name": str(version["version_name"]),
        "message": "Candidate version saved. Production remains unchanged.",
        "use_case_id": str(version["use_case_id"]),
    }


def stage_model_version(model_version_id: str) -> dict[str, Any]:
    version = _get_model_version_or_404(model_version_id)
    _ensure_model_file_exists(str(version["model_path"]))
    update_use_case_versions_status(
        use_case_id=str(version["use_case_id"]),
        from_status="staging",
        to_status="candidate",
        exclude_model_version_id=model_version_id,
    )
    staged_version = update_model_version_status(model_version_id, status="staging")
    if staged_version is None:
        raise ModelRolloutError("Model version not found.", status_code=404)

    return {
        "model_version_id": str(staged_version["id"]),
        "status": str(staged_version["status"]),
        "model_path": str(staged_version["model_path"]),
        "version_name": str(staged_version["version_name"]),
        "message": "Model is staged for temporary validation. Production remains unchanged.",
        "use_case_id": str(staged_version["use_case_id"]),
    }


def promote_model_version(model_version_id: str) -> dict[str, Any]:
    version = _get_model_version_or_404(model_version_id)
    _ensure_model_file_exists(str(version["model_path"]))

    previous_promoted = get_promoted_model_version(str(version["use_case_id"]))
    if previous_promoted and str(previous_promoted["id"]) != model_version_id:
        update_model_version_status(str(previous_promoted["id"]), status="archived")

    update_use_case_versions_status(
        use_case_id=str(version["use_case_id"]),
        from_status="staging",
        to_status="candidate",
        exclude_model_version_id=model_version_id,
    )

    promoted_version = update_model_version_status(model_version_id, status="promoted")
    if promoted_version is None:
        raise ModelRolloutError("Model version not found.", status_code=404)

    active_model = upsert_active_model(
        use_case_id=str(promoted_version["use_case_id"]),
        active_model_version_id=str(promoted_version["id"]),
        active_model_path=str(promoted_version["model_path"]),
    )

    return {
        "model_version_id": str(promoted_version["id"]),
        "status": str(promoted_version["status"]),
        "model_path": str(promoted_version["model_path"]),
        "version_name": str(promoted_version["version_name"]),
        "active_model_path": str(active_model["active_model_path"]),
        "message": "New model promoted. It is now the active model for this use case.",
        "use_case_id": str(promoted_version["use_case_id"]),
    }


def keep_current_model(model_version_id: str) -> dict[str, Any]:
    version = _get_model_version_or_404(model_version_id)
    if str(version["status"]) == "promoted":
        return {
            "model_version_id": str(version["id"]),
            "status": "kept_current",
            "model_path": str(version["model_path"]),
            "version_name": str(version["version_name"]),
            "message": "Current model remains active. Candidate was not promoted.",
            "use_case_id": str(version["use_case_id"]),
        }

    updated_version = update_model_version_status(model_version_id, status="archived")
    if updated_version is None:
        raise ModelRolloutError("Model version not found.", status_code=404)

    return {
        "model_version_id": str(updated_version["id"]),
        "status": "kept_current",
        "model_path": str(updated_version["model_path"]),
        "version_name": str(updated_version["version_name"]),
        "message": "Current model remains active. Candidate was not promoted.",
        "use_case_id": str(updated_version["use_case_id"]),
    }


def get_rollout_state(job_id: str) -> dict[str, Any]:
    job = get_training_job(job_id)
    if job is None:
        raise ModelRolloutError("Training job not found.", status_code=404)

    saved_version = get_latest_model_version_for_job(job_id)
    use_case_id = str(job["use_case_id"])
    staging_version = get_staging_model_version(use_case_id)
    active_model = get_active_model(use_case_id)

    return {
        "training_job": {
            "id": str(job["id"]),
            "status": str(job["status"]),
            "use_case_id": use_case_id,
            "output_model_path": str(job.get("output_model_path") or ""),
            "plan_config": job.get("plan_config") or {},
        },
        "saved_version": _serialize_model_version(saved_version),
        "staging_version": _serialize_model_version(staging_version),
        "active_model": _serialize_active_model(active_model, use_case_id),
    }


def _get_completed_training_job(job_id: str) -> dict[str, Any]:
    job = get_training_job(job_id)
    if job is None:
        raise ModelRolloutError("Training job not found.", status_code=404)
    if str(job.get("status") or "") != ALLOWED_ROLLOUT_JOB_STATUS:
        raise ModelRolloutError("Rollout actions require a completed training job.", status_code=400)

    output_model_path = str(job.get("output_model_path") or "")
    if not output_model_path:
        raise ModelRolloutError("Training job does not have an output model path yet.", status_code=400)

    _ensure_model_file_exists(output_model_path)
    return job


def _get_model_version_or_404(model_version_id: str) -> dict[str, Any]:
    version = get_model_version(model_version_id)
    if version is None:
        raise ModelRolloutError("Model version not found.", status_code=404)
    return version


def _build_version_name(job: dict[str, Any]) -> str:
    use_case_id = str(job.get("use_case_id") or "model")
    compact_job_id = str(job.get("id") or "")[-8:]
    return f"{use_case_id}-{compact_job_id}"


def _ensure_model_file_exists(model_path: str) -> None:
    resolved_path = Path(model_path)
    if not resolved_path.is_absolute():
        resolved_path = BASE_DIR / resolved_path
    if not resolved_path.exists():
        raise ModelRolloutError("Model file does not exist for this rollout action.", status_code=400)


def _serialize_model_version(version: dict[str, Any] | None) -> dict[str, Any] | None:
    if version is None:
        return None
    return {
        "id": str(version["id"]),
        "training_job_id": str(version["training_job_id"]),
        "use_case_id": str(version["use_case_id"]),
        "model_path": str(version["model_path"]),
        "version_name": str(version["version_name"]),
        "status": str(version["status"]),
        "created_at": str(version["created_at"]),
        "updated_at": str(version["updated_at"]),
        "metadata_json": version.get("metadata_json") or {},
    }


def _serialize_active_model(active_model: dict[str, Any] | None, use_case_id: str) -> dict[str, Any]:
    if active_model is None:
        return {
            "use_case_id": use_case_id,
            "active_model_version_id": "",
            "active_model_path": "",
            "updated_at": "",
        }
    return {
        "use_case_id": str(active_model["use_case_id"]),
        "active_model_version_id": str(active_model.get("active_model_version_id") or ""),
        "active_model_path": str(active_model.get("active_model_path") or ""),
        "updated_at": str(active_model.get("updated_at") or ""),
    }
