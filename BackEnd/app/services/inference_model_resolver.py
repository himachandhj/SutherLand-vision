from pathlib import Path
from typing import Any

from app.models.model_version import get_active_model, get_model_version, get_staging_model_version


BASE_DIR = Path(__file__).resolve().parents[2]
BEST_MODEL_PATH = BASE_DIR / "best.pt"
FIRE_SMOKE_MODEL_PATH = BASE_DIR / "models" / "fire_smoke" / "best.pt"
PPE_MODEL_PATH = BASE_DIR / "models" / "ppe" / "best.pt"
REGION_ALERTS_MODEL_PATH = BASE_DIR / "models" / "region_alerts" / "best.pt"
SPEED_ESTIMATION_MODEL_PATH = BASE_DIR / "models" / "speed_estimation" / "best.pt"
SPEED_MODEL_PATH = BASE_DIR / "models" / "speed" / "best.pt"
OBJECT_TRACKING_MODEL_PATH = BASE_DIR / "models" / "object_tracking" / "best.pt"
TRACKING_MODEL_PATH = BASE_DIR / "models" / "tracking" / "best.pt"
CRACK_DETECTION_MODEL_PATH = BASE_DIR / "models" / "crack_detection" / "best.pt"
UNSAFE_BEHAVIOR_SMOKING_MODEL_PATH = BASE_DIR / "models" / "unsafe_behavior" / "smoking_best.pt"
LOCAL_FALLBACK_MODEL_PATH = BASE_DIR / "yolov8n.pt"
FALLBACK_MODEL_NAME = "yolov8n.pt"
SAFE_EXPLICIT_STATUSES = {"candidate", "staging", "promoted"}


def resolve_inference_model_path(
    use_case_id: str,
    *,
    model_mode: str = "active",
    model_version_id: str | None = None,
) -> dict[str, Any]:
    requested_mode = normalize_model_mode(model_mode)

    if model_version_id:
        version = get_model_version(model_version_id)
        if version and str(version.get("use_case_id") or "") == use_case_id and str(version.get("status") or "") in SAFE_EXPLICIT_STATUSES:
            resolved = _resolve_existing_model_path(str(version["model_path"]))
            if resolved:
                return {
                    "model_path": str(resolved),
                    "display_model_path": str(version["model_path"]),
                    "model_mode_used": str(version["status"]),
                    "fallback_used": False,
                    "fallback_reason": None,
                    "model_version_id_used": str(version["id"]),
                }

    if requested_mode == "staging":
        staged_version = get_staging_model_version(use_case_id)
        if staged_version is not None:
            resolved = _resolve_existing_model_path(str(staged_version["model_path"]))
            if resolved:
                return {
                    "model_path": str(resolved),
                    "display_model_path": str(staged_version["model_path"]),
                    "model_mode_used": "staging",
                    "fallback_used": False,
                    "fallback_reason": None,
                    "model_version_id_used": str(staged_version["id"]),
                }

    active_model = get_active_model(use_case_id)
    if active_model is not None:
        active_model_path = str(active_model.get("active_model_path") or "")
        resolved = _resolve_existing_model_path(active_model_path)
        if resolved:
            return {
                "model_path": str(resolved),
                "display_model_path": active_model_path,
                "model_mode_used": "active",
                "fallback_used": requested_mode == "staging",
                "fallback_reason": "Staged model was unavailable, so current active/default model was used." if requested_mode == "staging" else None,
                "model_version_id_used": str(active_model.get("active_model_version_id") or ""),
            }

    default_model_path = resolve_default_inference_model_path(use_case_id)
    if str(use_case_id or "").strip().lower() in {"crack-detection", "unsafe-behavior-detection"}:
        return {
            "model_path": default_model_path,
            "display_model_path": default_model_path,
            "model_mode_used": "active",
            "fallback_used": False,
            "fallback_reason": None,
            "model_version_id_used": "",
        }
    return {
        "model_path": default_model_path,
        "display_model_path": default_model_path,
        "model_mode_used": "default_fallback",
        "fallback_used": requested_mode == "staging" or active_model is None,
        "fallback_reason": (
            "Staged model was unavailable, so current active/default model was used."
            if requested_mode == "staging"
            else "No promoted active model was found, so the existing default model was used."
        ),
        "model_version_id_used": "",
    }


def get_integration_model_state(use_case_id: str) -> dict[str, Any]:
    staged_version = get_staging_model_version(use_case_id)
    active_model = get_active_model(use_case_id)

    staged_model_path = str(staged_version["model_path"]) if staged_version else None
    active_model_path = str(active_model.get("active_model_path") or "") if active_model else None

    return {
        "use_case_id": use_case_id,
        "has_staged_model": bool(staged_version and _resolve_existing_model_path(staged_model_path)),
        "staged_model_version_id": str(staged_version["id"]) if staged_version else None,
        "staged_model_path": staged_model_path,
        "has_active_model": bool(active_model_path and _resolve_existing_model_path(active_model_path)),
        "active_model_path": active_model_path or None,
        "default_model_available": _has_default_inference_model(use_case_id),
    }


def resolve_default_inference_model_path(use_case_id: str | None = None) -> str:
    normalized = str(use_case_id or "").strip().lower()
    if normalized == "crack-detection":
        return str(CRACK_DETECTION_MODEL_PATH)
    if normalized == "unsafe-behavior-detection":
        return str(UNSAFE_BEHAVIOR_SMOKING_MODEL_PATH)
    for candidate in _get_use_case_default_model_candidates(use_case_id):
        if candidate.exists():
            return str(candidate)
    if LOCAL_FALLBACK_MODEL_PATH.exists():
        return str(LOCAL_FALLBACK_MODEL_PATH)
    return FALLBACK_MODEL_NAME


def normalize_model_mode(value: str | None) -> str:
    normalized = (value or "active").strip().lower()
    return "staging" if normalized == "staging" else "active"


def _resolve_existing_model_path(model_path: str | None) -> Path | None:
    if not model_path:
        return None
    path = Path(model_path)
    if not path.is_absolute():
        path = BASE_DIR / path
    return path.resolve() if path.exists() else None


def _get_use_case_default_model_candidates(use_case_id: str | None) -> tuple[Path, ...]:
    normalized = str(use_case_id or "").strip().lower()
    if normalized == "fire-detection":
        return (FIRE_SMOKE_MODEL_PATH, BEST_MODEL_PATH)
    if normalized == "ppe-detection":
        return (PPE_MODEL_PATH, BEST_MODEL_PATH)
    if normalized == "region-alerts":
        return (REGION_ALERTS_MODEL_PATH, BEST_MODEL_PATH)
    if normalized == "speed-estimation":
        return (SPEED_ESTIMATION_MODEL_PATH, SPEED_MODEL_PATH, BEST_MODEL_PATH)
    if normalized == "object-tracking":
        return (OBJECT_TRACKING_MODEL_PATH, TRACKING_MODEL_PATH, BEST_MODEL_PATH)
    if normalized == "crack-detection":
        return (CRACK_DETECTION_MODEL_PATH,)
    if normalized == "unsafe-behavior-detection":
        return (UNSAFE_BEHAVIOR_SMOKING_MODEL_PATH,)
    return (BEST_MODEL_PATH,)


def _has_default_inference_model(use_case_id: str | None) -> bool:
    return any(candidate.exists() for candidate in _get_use_case_default_model_candidates(use_case_id)) or LOCAL_FALLBACK_MODEL_PATH.exists()
