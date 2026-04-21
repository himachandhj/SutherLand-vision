from __future__ import annotations

from typing import Any

from app.core.database import (
    get_dataset,
    get_fine_tuning_session,
    get_latest_dataset_audit_for_dataset,
    update_dataset_label_status,
    update_fine_tuning_session,
)
from app.schemas.fine_tuning import FineTuningDatasetReadyPayload


SUPPORTED_LABEL_STATUSES = {"ready", "missing", "partial", "unknown"}
ACCEPTED_FORMATS = ["zip_images", "zip_clips", "yolo_labels"]


def _payload_to_dict(payload: Any) -> dict[str, Any]:
    if hasattr(payload, "model_dump"):
        return payload.model_dump()
    if isinstance(payload, dict):
        return payload
    return dict(payload)


def normalize_label_status(label_status: str | None) -> str:
    value = (label_status or "unknown").strip().lower().replace(" ", "_")
    if value in {"ready", "present", "available", "labeled"}:
        return "ready"
    if value in {"missing", "none", "not_found", "no_labels"}:
        return "missing"
    if value in {"partial", "incomplete", "partially_labeled"}:
        return "partial"
    if value in {"unknown", "not_sure", "unsure", ""}:
        return "unknown"
    raise ValueError("Unsupported label status. Use ready, missing, partial, or unknown.")


def _guidance_for_status(label_status: str) -> dict[str, Any]:
    if label_status == "ready":
        return {
            "guidance_title": "Labels look ready",
            "guidance_message": "You can continue to training setup.",
            "recommended_next_action": "continue",
            "can_continue": True,
        }
    if label_status == "missing":
        return {
            "guidance_title": "Labels are missing",
            "guidance_message": "Label annotation is required before training.",
            "recommended_next_action": "label_data",
            "can_continue": False,
        }
    if label_status == "partial":
        return {
            "guidance_title": "Labels are incomplete",
            "guidance_message": "Review label coverage before training.",
            "recommended_next_action": "review_labels",
            "can_continue": False,
        }
    return {
        "guidance_title": "Label status needs confirmation",
        "guidance_message": "Confirm whether labels are available and usable.",
        "recommended_next_action": "confirm_labels",
        "can_continue": False,
    }


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
    return session, dataset


def _latest_audit(session_id: int, dataset_id: int) -> dict[str, Any] | None:
    audit = get_latest_dataset_audit_for_dataset(dataset_id=dataset_id, session_id=session_id)
    if audit is None:
        audit = get_latest_dataset_audit_for_dataset(dataset_id=dataset_id)
    return audit


def _readiness_score(session: dict[str, Any], audit: dict[str, Any] | None) -> int | None:
    if audit and audit.get("readiness_score") is not None:
        return int(audit["readiness_score"])
    if session.get("readiness_score") is not None:
        return int(session["readiness_score"])
    return None


def _label_state_response(session: dict[str, Any], dataset: dict[str, Any]) -> dict[str, Any]:
    label_status = normalize_label_status(dataset.get("label_status"))
    audit = _latest_audit(int(session["id"]), int(dataset["id"]))
    guidance = _guidance_for_status(label_status)
    readiness_score = _readiness_score(session, audit)
    audit_status = audit.get("status") if audit else dataset.get("audit_status", "not_run")
    return {
        "session_id": int(session["id"]),
        "dataset_id": int(dataset["id"]),
        "dataset_name": dataset["name"],
        "current_label_status": label_status,
        "readiness_score": readiness_score,
        "audit_status": audit_status or "not_run",
        **guidance,
    }


def get_label_state(session_id: int) -> dict[str, Any]:
    session, dataset = _session_and_selected_dataset(session_id)
    return _label_state_response(session, dataset)


def update_label_status(session_id: int, payload: Any) -> dict[str, Any]:
    session, dataset = _session_and_selected_dataset(session_id)
    data = _payload_to_dict(payload)
    label_status = normalize_label_status(str(data.get("label_status") or "unknown"))
    updated_dataset = update_dataset_label_status(int(dataset["id"]), label_status=label_status)
    guidance = _guidance_for_status(label_status)
    update_fine_tuning_session(
        int(session["id"]),
        current_step=max(int(session.get("current_step") or 1), 3),
        recommended_next_action=guidance["guidance_message"],
    )
    refreshed_session = get_fine_tuning_session(int(session["id"])) or session
    return _label_state_response(refreshed_session, updated_dataset)


def _prepared_dataset_uri(dataset: dict[str, Any]) -> str:
    bucket = str(dataset.get("minio_bucket") or "").strip()
    prefix = str(dataset.get("minio_prefix") or "").strip().strip("/")
    if not bucket:
        raise ValueError("Selected dataset is missing a MinIO bucket.")
    if prefix:
        return f"minio://{bucket}/{prefix}"
    return f"minio://{bucket}"


def _handoff_status(label_status: str) -> str:
    if label_status == "ready":
        return "ready_for_training"
    if label_status == "missing":
        return "needs_labeling"
    return "needs_review"


def _model_dump(model: FineTuningDatasetReadyPayload) -> dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()


def build_dataset_ready_payload(session_id: int) -> dict[str, Any]:
    session, dataset = _session_and_selected_dataset(session_id)
    if dataset.get("source_type") != "minio":
        raise ValueError("Only MinIO-backed datasets can be prepared for the training handoff.")

    label_status = normalize_label_status(dataset.get("label_status"))
    audit = _latest_audit(int(session["id"]), int(dataset["id"]))
    readiness_score = _readiness_score(session, audit)
    status = _handoff_status(label_status)
    guidance = _guidance_for_status(label_status)

    payload = FineTuningDatasetReadyPayload(
        workspace_id=f"fine-tuning-session-{session_id}",
        dataset_id=int(dataset["id"]),
        use_case_id=str(session["usecase_slug"]),
        dataset_name=str(dataset["name"]),
        label_status=label_status,
        readiness_score=readiness_score,
        prepared_dataset_uri=_prepared_dataset_uri(dataset),
        # TODO Step 4: populate this from lightweight label schema/class parsing.
        classes=[],
        accepted_formats=ACCEPTED_FORMATS,
        status=status,
    )
    update_fine_tuning_session(
        int(session["id"]),
        current_step=max(int(session.get("current_step") or 1), 3),
        recommended_next_action=(
            "Dataset is ready for training setup handoff."
            if status == "ready_for_training"
            else guidance["guidance_message"]
        ),
    )
    return _model_dump(payload)
