from __future__ import annotations


LABEL_STATUS_READY_THRESHOLD = 0.8
VALID_LABEL_STATUSES = {"ready", "missing", "partial", "unknown"}


def normalize_label_status(label_status: str | None) -> str:
    value = (label_status or "unknown").strip().lower().replace(" ", "_")
    if value in {"ready", "present", "available", "labeled"}:
        return "ready"
    if value in {"partial", "incomplete", "partially_labeled"}:
        return "partial"
    if value in {"missing", "none", "not_found", "no_labels"}:
        return "missing"
    if value in {"unknown", "not_sure", "unsure", ""}:
        return "unknown"
    return "unknown"


def label_coverage(item_count: int | None, label_count: int | None) -> float:
    items = int(item_count or 0)
    labels = int(label_count or 0)
    if items <= 0:
        return 0.0
    return labels / items


def compute_label_status(item_count: int | None, label_count: int | None) -> str:
    labels = int(label_count or 0)
    if labels <= 0:
        return "missing"
    return "ready" if label_coverage(item_count, labels) >= LABEL_STATUS_READY_THRESHOLD else "partial"


def resolve_label_status(
    stored_status: str | None,
    *,
    item_count: int | None = None,
    label_count: int | None = None,
) -> str:
    if label_count is not None:
        return compute_label_status(item_count, label_count)
    return normalize_label_status(stored_status)
