from __future__ import annotations

from typing import Any

from app.core.database import (
    get_dataset,
    get_fine_tuning_session,
    get_latest_dataset_audit_for_dataset,
    update_dataset_label_status,
    update_fine_tuning_session,
)
from app.services.dataset_label_status import normalize_label_status, resolve_label_status
from app.services.dataset_contract_service import build_finalized_dataset_ready_payload


SUPPORTED_LABEL_STATUSES = {"ready", "missing", "partial", "unknown"}


def _payload_to_dict(payload: Any) -> dict[str, Any]:
    if hasattr(payload, "model_dump"):
        return payload.model_dump()
    if isinstance(payload, dict):
        return payload
    return dict(payload)


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
    audit = _latest_audit(int(session["id"]), int(dataset["id"]))
    audit_summary = audit.get("summary_json", {}) if audit else {}
    item_count = audit_summary.get("file_count") if isinstance(audit_summary, dict) else None
    label_count = audit_summary.get("label_file_count") if isinstance(audit_summary, dict) else None
    label_status = resolve_label_status(dataset.get("label_status"), item_count=item_count, label_count=label_count)
    if label_status != normalize_label_status(dataset.get("label_status")):
        dataset = update_dataset_label_status(int(dataset["id"]), label_status=label_status)
    guidance = _guidance_for_status(label_status)
    readiness_score = _readiness_score(session, audit)
    audit_status = audit.get("status") if audit else dataset.get("audit_status", "not_run")
    warnings = [issue.get("message") or issue.get("code") for issue in audit.get("issues_json", [])] if audit else []
    blocking_issues = [
        issue.get("message") or issue.get("code")
        for issue in audit.get("issues_json", [])
        if issue.get("severity") == "high"
    ] if audit else []
    return {
        "session_id": int(session["id"]),
        "dataset_id": int(dataset["id"]),
        "dataset_name": dataset["name"],
        "current_label_status": label_status,
        "item_count": int(item_count or dataset.get("file_count") or 0),
        "label_count": int(label_count or 0),
        "label_coverage": audit_summary.get("label_coverage") if isinstance(audit_summary, dict) else None,
        "readiness_score": readiness_score,
        "audit_status": audit_status or "not_run",
        "warnings": [item for item in warnings if item],
        "blocking_issues": [item for item in blocking_issues if item],
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


def build_dataset_ready_payload(session_id: int) -> dict[str, Any]:
    return build_finalized_dataset_ready_payload(session_id)
