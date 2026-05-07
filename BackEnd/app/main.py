import asyncio
import base64
import mimetypes
import math
import hashlib
import io
import json
import random
import tempfile
import shutil
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote
from uuid import uuid4

import cv2
import numpy as np
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from ultralytics import YOLO

from app.core.config import settings
from app.core.database import (
    create_job,
    get_connection,
    get_integration_run,
    get_job,
    init_db,
    list_integration_runs,
    list_jobs,
    replace_class_wise_object_counting_outputs,
    replace_crack_detection_outputs,
    replace_fire_detection_outputs,
    replace_object_tracking_outputs,
    replace_ppe_detection_outputs,
    replace_queue_management_outputs,
    replace_region_alert_outputs,
    replace_speed_estimation_outputs,
    replace_unsafe_behavior_outputs,
    upsert_class_wise_object_counting_input,
    upsert_crack_detection_input,
    upsert_fire_detection_input,
    upsert_object_tracking_input,
    upsert_ppe_detection_input,
    upsert_queue_management_input,
    upsert_region_alert_input,
    upsert_speed_estimation_input,
    upsert_unsafe_behavior_input,
    update_integration_run,
    update_job,
    upsert_integration_run,
)
from app.core.minio_integration import (
    IMAGE_EXTENSIONS as MINIO_IMAGE_EXTENSIONS,
    MinioConnectionConfig,
    build_output_object_key,
    build_presigned_get_url,
    create_client,
    list_media_objects,
    list_video_objects,
    normalize_endpoint,
    normalize_prefix,
    object_exists,
    validate_bucket_access,
)
from app.schemas.job import UseCaseInfo, VideoJobResponse
from app.schemas.integration import (
    IntegrationModelStateResponse,
    IntegrationRunItem,
    IntegrationVideoItem,
    MinioConnectRequest,
    MinioConnectionDetails,
    MinioInputVideoListResponse,
    MinioIntegrationOverviewResponse,
    MinioProcessSelectedRequest,
    MinioProcessSelectedResponse,
    MinioUploadItem,
    MinioUploadResponse,
)
from app.routers.fine_tuning import router as fine_tuning_router
from app.services.inference_model_resolver import (
    get_integration_model_state,
    normalize_model_mode,
    resolve_default_inference_model_path,
    resolve_inference_model_path,
)
from app.schemas.fine_tuning import (
    FineTuningAutoLabelRequest,
    FineTuningAssistLabelRequest,
    FineTuningManualAnnotationRequest,
    FineTuningSamAssistRequest,
    FineTuningDatasetRegisterRequest,
    FineTuningDatasetSelectRequest,
    FineTuningLabelStatusRequest,
)
from app.services.annotation_service import (
    assist_propagate_dataset,
    assist_label_dataset,
    auto_label_dataset,
    export_selected_dataset_to_yolo,
    get_annotation_workspace,
    segment_with_sam,
    save_manual_annotations,
    train_assist_model,
)
from app.services.dataset_service import (
    delete_dataset_for_session,
    get_dataset_detail,
    list_datasets_for_session,
    register_dataset_for_session,
    select_dataset_for_session,
)
from app.services.labeling_service import (
    build_dataset_ready_payload,
    get_label_state,
    update_label_status,
)
from app.services.label_import_service import import_yolo_labels_for_session
from app.services.fine_tuning import (
    build_step_one_response,
    get_data_check_status,
    run_dataset_audit,
    start_data_check,
    start_new_setup,
    start_setup,
)
import ppe_detection as ppe_engine
from ppe_detection import auto_device, process_video as ppe_process_video
from use_cases.base import ensure_browser_playable_mp4, validate_output_video
from use_cases.crack_detection import process_image as crack_process_image
from use_cases.fire_smoke import detect_fire_smoke_hsv
from use_cases.registry import USE_CASE_REGISTRY, get_processor, get_metadata, list_use_cases
from use_cases.speed_estimation import process_video as speed_process_video
from use_cases.unsafe_behavior_detection import process_image as unsafe_behavior_process_image
from use_cases.zone_intrusion import PERSON_CLASS, create_default_zone, point_in_polygon

BASE_DIR = Path(__file__).resolve().parents[1]
STATIC_DIR = BASE_DIR / "static"
FALLBACK_VIDEO_CANDIDATES = [
    BASE_DIR / "PPE-test.mp4",
    BASE_DIR / "1.mp4",
]
STATIC_ASSET_FILES = [
    "PPE_VIDEO1.mp4",
    "PPE_VIDEO2.mp4",
    "PPE_2.png",
    "PPE_TEST1.png",
]
STATIC_PROCESSED_VIDEO = STATIC_DIR / "warehouse_processed.mp4"
SAMPLE_IMAGES_DIR = BASE_DIR / "Sample Images"
STATIC_SAMPLE_DIR = STATIC_DIR / "sample-images"
BEST_MODEL_PATH = BASE_DIR / "best.pt"
FALLBACK_MODEL_NAME = "yolov8n.pt"
LOCAL_FALLBACK_MODEL_PATH = BASE_DIR / FALLBACK_MODEL_NAME
PROCESSED_DIR = STATIC_DIR / "processed"
YOLO_MODEL: YOLO | None = None
YOLO_MODEL_SOURCE = ""
FIRE_SMOKE_PREVIEW_MODEL: YOLO | None = None
FIRE_SMOKE_PREVIEW_MODEL_SOURCE = ""
PPE_PREVIEW_PERSON_MODEL: YOLO | None = None
PPE_PREVIEW_MODEL_SOURCE = ""
PPE_PREVIEW_DETECTOR: ppe_engine.PPEDetector | None = None
INTEGRATION_PROVIDER = "minio"
INTEGRATION_USE_CASE_ID = "ppe-detection"
INTEGRATION_SUPPORTED_USE_CASES = {
    "class-wise-object-counting",
    "crack-detection",
    "ppe-detection",
    "queue-management",
    "region-alerts",
    "speed-estimation",
    "fire-detection",
    "unsafe-behavior-detection",
    "object-tracking",
}
INTEGRATION_USE_CASE_ALIASES = {
    "class-wise-counting": "class-wise-object-counting",
    "region-alert": "region-alerts",
}
INTEGRATION_USE_CASE_PREFIXES = {
    "class-wise-object-counting": ("counting/input/", "counting/output/"),
    "crack-detection": ("crack/input/", "crack/output/"),
    "queue-management": ("queue/input/", "queue/output/"),
    "ppe-detection": ("ppe/input/", "ppe/output/"),
    "region-alerts": ("region/input/", "region/output/"),
    "fire-detection": ("fire/input/", "fire/output/"),
    "speed-estimation": ("speed/input/", "speed/output/"),
    "unsafe-behavior-detection": ("unsafe_behavior/input/", "unsafe_behavior/output/"),
    "object-tracking": ("tracking/input/", "tracking/output/"),
}
INTEGRATION_USE_CASE_OUTPUT_SUFFIXES = {
    "class-wise-object-counting": "class_wise_object_counting",
    "crack-detection": "crack_detection",
    "queue-management": "queue_management",
    "ppe-detection": "ppe_detection",
    "region-alerts": "region_alert",
    "fire-detection": "fire_detection",
    "speed-estimation": "speed_estimation",
    "unsafe-behavior-detection": "unsafe_behavior",
    "object-tracking": "object_tracking",
}
INTEGRATION_PROCESSING_VERSIONS = {
    "class-wise-object-counting": 1,
    "crack-detection": 1,
    "fire-detection": 1,
    "ppe-detection": 3,
    "queue-management": 1,
    "region-alerts": 1,
    "speed-estimation": 1,
    "unsafe-behavior-detection": 1,
    "object-tracking": 1,
}
INTEGRATION_OVERVIEW_LIMIT = 5
INTEGRATION_STATE_LOCK = threading.Lock()
INTEGRATION_THREADS: dict[str, threading.Thread | None] = {}
INTEGRATION_STATES: dict[str, dict[str, Any]] = {}
REGION_SYNTHETIC_SOURCE_PREFIX = "synthetic-region-demo"
REGION_SYNTHETIC_METADATA_KEY = "synthetic_demo"
REGION_SYNTHETIC_MIN_OUTPUTS = 180
DEFAULT_ZONE_SPEED_LIMIT_KMH = 35.0
DEFAULT_QUEUE_MAX_LIMIT = 6
INTEGRATION_IMAGE_EXTENSIONS = set(MINIO_IMAGE_EXTENSIONS)


app = FastAPI(
    title=settings.app_name,
    version="0.2.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STATIC_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
STATIC_SAMPLE_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.include_router(fine_tuning_router)


class AnalyzeVideoRequest(BaseModel):
    filename: str


class AnalyzeUseCaseRequest(BaseModel):
    filename: str
    use_case_id: str


def ensure_mock_video() -> None:
    if STATIC_PROCESSED_VIDEO.exists():
        return
    for candidate in FALLBACK_VIDEO_CANDIDATES:
        if candidate.exists():
            shutil.copyfile(candidate, STATIC_PROCESSED_VIDEO)
            return


def sync_static_assets() -> None:
    for filename in STATIC_ASSET_FILES:
        source = BASE_DIR / filename
        target = STATIC_DIR / filename
        if source.exists() and not target.exists():
            shutil.copyfile(source, target)
    if SAMPLE_IMAGES_DIR.exists():
        for source in SAMPLE_IMAGES_DIR.iterdir():
            if source.is_file():
                target = STATIC_SAMPLE_DIR / source.name
                if not target.exists():
                    shutil.copyfile(source, target)


def load_yolo_model() -> None:
    global YOLO_MODEL, YOLO_MODEL_SOURCE
    candidate_sources = []

    if BEST_MODEL_PATH.exists():
        candidate_sources.append(str(BEST_MODEL_PATH))
    if LOCAL_FALLBACK_MODEL_PATH.exists():
        candidate_sources.append(str(LOCAL_FALLBACK_MODEL_PATH))

    candidate_sources.append(FALLBACK_MODEL_NAME)

    last_error = None
    for model_source in candidate_sources:
        try:
            YOLO_MODEL = YOLO(model_source)
            YOLO_MODEL_SOURCE = model_source
            return
        except Exception as error:
            last_error = error

    YOLO_MODEL = None
    YOLO_MODEL_SOURCE = f"unavailable: {last_error}" if last_error else "unavailable"


def load_fire_smoke_preview_components() -> None:
    global FIRE_SMOKE_PREVIEW_MODEL, FIRE_SMOKE_PREVIEW_MODEL_SOURCE

    model_source = BASE_DIR / "models" / "fire_smoke" / "best.pt"
    if not model_source.exists():
        FIRE_SMOKE_PREVIEW_MODEL = None
        FIRE_SMOKE_PREVIEW_MODEL_SOURCE = "unavailable: models/fire_smoke/best.pt not found"
        return

    try:
        FIRE_SMOKE_PREVIEW_MODEL = YOLO(str(model_source))
        FIRE_SMOKE_PREVIEW_MODEL_SOURCE = str(model_source)
    except Exception as error:
        FIRE_SMOKE_PREVIEW_MODEL = None
        FIRE_SMOKE_PREVIEW_MODEL_SOURCE = f"unavailable: {error}"


def load_ppe_preview_components() -> None:
    global PPE_PREVIEW_PERSON_MODEL, PPE_PREVIEW_MODEL_SOURCE, PPE_PREVIEW_DETECTOR

    model_source = str(BEST_MODEL_PATH) if BEST_MODEL_PATH.exists() else (
        str(LOCAL_FALLBACK_MODEL_PATH) if LOCAL_FALLBACK_MODEL_PATH.exists() else FALLBACK_MODEL_NAME
    )

    try:
        PPE_PREVIEW_PERSON_MODEL = YOLO(model_source)
        PPE_PREVIEW_MODEL_SOURCE = model_source
    except Exception as error:
        PPE_PREVIEW_PERSON_MODEL = None
        PPE_PREVIEW_MODEL_SOURCE = f"unavailable: {error}"
        PPE_PREVIEW_DETECTOR = None
        return

    ppe_model_path = ppe_engine.resolve_ppe_model_path()
    ppe_model, ppe_names = ppe_engine.load_ppe_model(ppe_model_path)
    PPE_PREVIEW_DETECTOR = ppe_engine.PPEDetector(
        ppe_model=ppe_model,
        ppe_names=ppe_names,
        ppe_conf=0.30,
        device=auto_device(),
    )


def resolve_default_model_path() -> str:
    return resolve_default_inference_model_path()


def _normalize_integration_use_case_id(value: str | None) -> str:
    normalized = (value or INTEGRATION_USE_CASE_ID).strip().lower()
    normalized = INTEGRATION_USE_CASE_ALIASES.get(normalized, normalized)
    if normalized not in INTEGRATION_SUPPORTED_USE_CASES:
        raise HTTPException(
            status_code=400,
            detail=(
                "Integration demo currently supports only "
                f"{', '.join(sorted(INTEGRATION_SUPPORTED_USE_CASES))}."
            ),
        )
    return normalized


def _get_integration_default_prefixes(use_case_id: str) -> tuple[str, str]:
    return INTEGRATION_USE_CASE_PREFIXES.get(
        use_case_id,
        (
            normalize_prefix(settings.minio_input_prefix, "input/"),
            normalize_prefix(settings.minio_output_prefix, "output/"),
        ),
    )


def _get_integration_output_suffix(use_case_id: str) -> str:
    return INTEGRATION_USE_CASE_OUTPUT_SUFFIXES.get(use_case_id, use_case_id.replace("-", "_"))


def _get_integration_use_case_title(use_case_id: str) -> str:
    meta = get_metadata(use_case_id)
    return str(meta["title"]) if meta else use_case_id


def _build_empty_integration_state(use_case_id: str) -> dict[str, Any]:
    return {
        "use_case_id": use_case_id,
        "connected": False,
        "processing": False,
        "pending_rescan": False,
        "processing_mode": "manual",
        "model_mode": "active",
        "model_version_id": None,
        "model_mode_used": "active",
        "model_path_used": resolve_default_model_path(),
        "fallback_used": False,
        "fallback_reason": None,
        "message": "",
        "last_sync_at": None,
        "connected_at": None,
        "credential_mode": "direct",
        "connection": None,
        "zone_points_normalized": None,
        "rule_config": None,
    }


def _ensure_integration_slot(use_case_id: str) -> None:
    with INTEGRATION_STATE_LOCK:
        if use_case_id not in INTEGRATION_STATES:
            INTEGRATION_STATES[use_case_id] = _build_empty_integration_state(use_case_id)
        if use_case_id not in INTEGRATION_THREADS:
            INTEGRATION_THREADS[use_case_id] = None


def _set_integration_state(use_case_id: str, **updates: Any) -> None:
    _ensure_integration_slot(use_case_id)
    with INTEGRATION_STATE_LOCK:
        INTEGRATION_STATES[use_case_id].update(updates)


def _get_integration_state(use_case_id: str) -> dict[str, Any]:
    _ensure_integration_slot(use_case_id)
    with INTEGRATION_STATE_LOCK:
        return dict(INTEGRATION_STATES[use_case_id])


def _get_integration_processing_version(use_case_id: str) -> int:
    return int(INTEGRATION_PROCESSING_VERSIONS.get(use_case_id, 0))


def _integration_output_needs_refresh(
    use_case_id: str,
    existing_run: dict[str, Any] | None,
    *,
    has_output: bool,
) -> bool:
    current_version = _get_integration_processing_version(use_case_id)
    if current_version <= 0 or not has_output:
        return False

    metrics = existing_run.get("metrics", {}) if isinstance(existing_run, dict) else {}
    stored_version_raw = metrics.get("processing_version") if isinstance(metrics, dict) else None
    try:
        stored_version = int(stored_version_raw)
    except (TypeError, ValueError):
        stored_version = None
    return stored_version != current_version


def _resolve_upload_use_case_id(requested_use_case_id: str | None) -> str:
    if requested_use_case_id and requested_use_case_id.strip():
        return _normalize_integration_use_case_id(requested_use_case_id)

    connected_use_cases = [
        use_case_id
        for use_case_id in sorted(INTEGRATION_SUPPORTED_USE_CASES)
        if _get_integration_state(use_case_id).get("connected")
    ]

    if len(connected_use_cases) == 1:
        return connected_use_cases[0]

    return _normalize_integration_use_case_id(requested_use_case_id)


def _build_connection_details(
    config: MinioConnectionConfig,
    *,
    use_case_id: str,
    connected_at: str | None,
    credential_mode: str,
    processing_mode: str,
    model_mode: str,
    model_version_id: str | None,
    model_mode_used: str | None,
    model_path_used: str | None,
    fallback_used: bool,
    fallback_reason: str | None,
    zone_points_normalized: list[list[float]] | None = None,
    rule_config: dict[str, Any] | None = None,
) -> MinioConnectionDetails:
    normalized = config.normalized()
    return MinioConnectionDetails(
        endpoint=normalized.display_endpoint,
        bucket=normalized.bucket,
        input_prefix=normalized.input_prefix,
        output_prefix=normalized.output_prefix,
        use_case_id=use_case_id,
        credential_mode=credential_mode,
        processing_mode=processing_mode,
        model_mode=model_mode,
        model_version_id=model_version_id,
        model_mode_used=model_mode_used,
        model_path_used=model_path_used,
        fallback_used=fallback_used,
        fallback_reason=fallback_reason,
        connected_at=connected_at,
        zone_points_normalized=zone_points_normalized,
        rule_config=rule_config,
    )


def _list_integration_objects(
    *,
    client,
    bucket: str,
    prefix: str,
    use_case_id: str,
) -> list[dict[str, object]]:
    if use_case_id in {"crack-detection", "unsafe-behavior-detection"}:
        return list_media_objects(
            client,
            bucket,
            prefix,
            allowed_extensions=INTEGRATION_IMAGE_EXTENSIONS.union({".mp4", ".avi", ".mov", ".mkv", ".webm"}),
        )
    return list_video_objects(client, bucket, prefix)


def _payload_field_provided(payload: BaseModel, field_name: str) -> bool:
    fields_set = getattr(payload, "model_fields_set", None)
    if fields_set is None:
        fields_set = getattr(payload, "__fields_set__", set())
    return field_name in fields_set


def _build_connection_candidates(payload: MinioConnectRequest) -> list[tuple[str, MinioConnectionConfig]]:
    use_case_id = _normalize_integration_use_case_id(payload.use_case_id)
    default_input_prefix, default_output_prefix = _get_integration_default_prefixes(use_case_id)
    requested_input_prefix = (payload.input_prefix or "").strip()
    requested_output_prefix = (payload.output_prefix or "").strip()

    direct_config = MinioConnectionConfig(
        endpoint=payload.endpoint,
        access_key=payload.access_key,
        secret_key=payload.secret_key,
        bucket=payload.bucket,
        input_prefix=default_input_prefix if requested_input_prefix.strip("/") in {"", "input"} else requested_input_prefix,
        output_prefix=default_output_prefix if requested_output_prefix.strip("/") in {"", "output"} else requested_output_prefix,
    ).normalized()

    candidates: list[tuple[str, MinioConnectionConfig]] = [("direct", direct_config)]
    if not settings.minio_demo_mode:
        return candidates

    bucket_candidates = [direct_config.bucket] if direct_config.bucket else []
    if settings.minio_bucket not in bucket_candidates:
        bucket_candidates.append(settings.minio_bucket)

    seen: set[tuple[str, str, str, str, str, str, bool]] = {
        (
            direct_config.endpoint,
            direct_config.access_key,
            direct_config.secret_key,
            direct_config.bucket,
            direct_config.input_prefix,
            direct_config.output_prefix,
            direct_config.secure,
        )
    }

    for bucket_name in bucket_candidates:
        demo_candidate = MinioConnectionConfig(
            endpoint=settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            bucket=bucket_name,
            input_prefix=direct_config.input_prefix or default_input_prefix,
            output_prefix=direct_config.output_prefix or default_output_prefix,
            secure=settings.minio_secure,
        ).normalized()
        signature = (
            demo_candidate.endpoint,
            demo_candidate.access_key,
            demo_candidate.secret_key,
            demo_candidate.bucket,
            demo_candidate.input_prefix,
            demo_candidate.output_prefix,
            demo_candidate.secure,
        )
        if signature in seen:
            continue
        seen.add(signature)
        candidates.append(("demo", demo_candidate))

    return candidates


def _utc_now_iso() -> str:
    return str(np.datetime_as_string(np.datetime64("now"), timezone="UTC"))


def _should_auto_create_bucket(mode: str, candidate: MinioConnectionConfig) -> bool:
    if not settings.minio_demo_mode:
        return False
    if mode == "demo":
        return True

    settings_endpoint, settings_secure = normalize_endpoint(settings.minio_endpoint, settings.minio_secure)
    return candidate.endpoint == settings_endpoint and candidate.secure == settings_secure


def _build_unique_input_object_key(
    client,
    config: MinioConnectionConfig,
    filename: str,
    *,
    use_case_id: str,
) -> tuple[str, str]:
    safe_name = Path(filename or "upload.mp4").name
    stem = Path(safe_name).stem or "video"
    suffix = Path(safe_name).suffix.lower() or ".mp4"

    candidate_suffix = suffix if suffix in ALLOWED_VIDEO_EXTENSIONS else ".mp4"
    counter = 0

    while True:
        candidate_name = (
            f"{stem}{candidate_suffix}"
            if counter == 0
            else f"{stem}_{counter}_{uuid4().hex[:8]}{candidate_suffix}"
        )
        object_key = f"{config.input_prefix}{candidate_name}" if config.input_prefix else candidate_name
        output_key = build_output_object_key(
            object_key,
            config.input_prefix,
            config.output_prefix,
            use_case_suffix=_get_integration_output_suffix(use_case_id),
        )
        if not object_exists(client, config.bucket, object_key) and not object_exists(client, config.bucket, output_key):
            return object_key, output_key
        counter += 1


def _resolve_minio_connection(payload: MinioConnectRequest) -> tuple[MinioConnectionConfig, str, bool]:
    failures: list[str] = []
    for mode, candidate in _build_connection_candidates(payload):
        try:
            client = create_client(candidate)
            bucket_created = validate_bucket_access(
                client,
                candidate.bucket,
                auto_create=_should_auto_create_bucket(mode, candidate),
            )
            return candidate, mode, bucket_created
        except Exception as error:
            failures.append(f"{mode}: {error}")

    raise HTTPException(
        status_code=400,
        detail="Unable to connect to MinIO. " + (" | ".join(failures) if failures else "Unknown error."),
    )


def _build_recent_run_item(run: dict[str, Any], client) -> IntegrationRunItem:
    return IntegrationRunItem(
        id=int(run["id"]),
        provider=str(run["provider"]),
        use_case_id=str(run["use_case_id"]),
        bucket=str(run["bucket"]),
        input_key=str(run["input_key"]),
        output_key=str(run["output_key"]),
        status=str(run["status"]),
        message=str(run["message"]),
        metrics=run.get("metrics", {}) or {},
        created_at=str(run["created_at"]),
        updated_at=str(run["updated_at"]),
        input_url=_build_integration_proxy_url(str(run["use_case_id"]), str(run["input_key"])),
        output_url=_build_integration_proxy_url(str(run["use_case_id"]), str(run["output_key"])),
    )


def _normalize_processing_mode(value: str | None) -> str:
    normalized = (value or "manual").strip().lower()
    if normalized not in {"auto", "manual"}:
        raise HTTPException(status_code=400, detail="processing_mode must be either 'auto' or 'manual'.")
    return normalized


def _wait_for_auto_poll_or_rescan(use_case_id: str) -> bool:
    interval = max(1, int(settings.minio_auto_poll_interval_seconds))
    deadline = time.time() + interval

    while time.time() < deadline:
        snapshot = _get_integration_state(use_case_id)
        if not snapshot.get("connected"):
            return False
        if snapshot.get("pending_rescan"):
            _set_integration_state(use_case_id, pending_rescan=False)
            return True
        if str(snapshot.get("processing_mode") or "manual") != "auto":
            return False
        time.sleep(1)

    return True


def _build_minio_uri(bucket: str | None, object_key: str | None) -> str | None:
    if not bucket or not object_key:
        return None
    return f"minio://{bucket}/{object_key.lstrip('/')}"


def _build_integration_proxy_url(use_case_id: str, object_key: str | None) -> str | None:
    if not object_key:
        return None
    canonical_use_case_id = _normalize_integration_use_case_id(use_case_id)
    return f"/api/integrations/minio/object?use_case_id={quote(canonical_use_case_id)}&object_key={quote(object_key, safe='')}"


def _parse_http_byte_range(range_header: str, total_size: int) -> tuple[int, int]:
    if total_size <= 0:
        raise ValueError("Range requests require a non-empty object.")

    units, value = range_header.strip().split("=", 1)
    if units.strip().lower() != "bytes":
        raise ValueError("Unsupported range unit")

    if "," in value:
        raise ValueError("Multiple byte ranges are not supported")

    start_text, end_text = value.split("-", 1)
    start_text = start_text.strip()
    end_text = end_text.strip()

    if not start_text and not end_text:
        raise ValueError("Missing byte range values")

    if not start_text:
        suffix_length = int(end_text)
        if suffix_length <= 0:
            raise ValueError("Suffix byte range must be greater than zero")
        if suffix_length >= total_size:
            return 0, total_size - 1
        return total_size - suffix_length, total_size - 1

    start = int(start_text)
    if start < 0 or start >= total_size:
        raise ValueError("Range start is outside the object")

    if not end_text:
        return start, total_size - 1

    end = int(end_text)
    if end < start:
        raise ValueError("Range end precedes range start")

    return start, min(end, total_size - 1)


def _derive_demo_source_metadata(source_ref: str, simulated_timestamp: str) -> dict[str, str]:
    digest = hashlib.sha1(source_ref.encode("utf-8")).hexdigest()
    camera_index = int(digest[0:2], 16) % 8 + 1
    location_options = [
        "Warehouse A",
        "Loading Bay",
        "Assembly Floor",
        "Packing Zone",
        "Dispatch Corridor",
    ]
    zone_options = [
        "Zone 1",
        "Zone 2",
        "Zone 3",
        "Restricted Bay",
        "Dock Lane",
    ]
    shift_options = ["Morning", "Afternoon", "Night"]

    try:
        timestamp_hour = int(simulated_timestamp[11:13])
        if 6 <= timestamp_hour < 14:
            shift = "Morning"
        elif 14 <= timestamp_hour < 22:
            shift = "Afternoon"
        else:
            shift = "Night"
    except Exception:
        shift = shift_options[int(digest[2:4], 16) % len(shift_options)]

    return {
        "camera_id": f"CAM-{camera_index:02d}",
        "location": location_options[int(digest[4:6], 16) % len(location_options)],
        "zone": zone_options[int(digest[6:8], 16) % len(zone_options)],
        "shift": shift,
    }


def _derive_persisted_context(
    *,
    use_case_id: str,
    source_ref: str,
    simulated_timestamp: str,
) -> dict[str, Any]:
    if use_case_id == "crack-detection":
        return {
            "camera_id": "CAM-CRACK-01",
            "location": "Infrastructure Inspection Site",
            "zone": "Inspection Zone",
            "shift": "Day",
            "generated_context": True,
            "generated_fields": ["camera_id", "location", "zone"],
        }
    if use_case_id == "unsafe-behavior-detection":
        return {
            "camera_id": "CAM-SAFE-01",
            "location": "Manufacturing Plant A",
            "zone": "Work Zone",
            "shift": "Day",
            "generated_context": True,
            "generated_fields": ["camera_id", "location", "zone"],
        }

    base = _derive_demo_source_metadata(source_ref, simulated_timestamp)
    return {
        **base,
        "generated_context": False,
        "generated_fields": [],
    }


def _derive_persisted_filename(
    *,
    filename: str,
    input_object_key: str | None,
    source_ref: str,
) -> str:
    if input_object_key:
        object_name = Path(str(input_object_key)).name.strip()
        if object_name:
            return object_name
    candidate = Path(str(filename or "")).name.strip()
    if candidate:
        return candidate
    source_name = Path(str(source_ref).rstrip("/")).name.strip()
    return source_name or "input_media"


def _stable_hash_int(value: str, *, start: int = 0, length: int = 8) -> int:
    digest = hashlib.sha1(value.encode("utf-8")).hexdigest()
    return int(digest[start:start + length], 16)


def _derive_zone_speed_limit_kmh(source_ref: str, zone: str) -> float:
    zone_limits = {
        "Restricted Bay": 20.0,
        "Dock Lane": 25.0,
        "Zone 1": 30.0,
        "Zone 2": 35.0,
        "Zone 3": 40.0,
    }
    return float(zone_limits.get(zone, DEFAULT_ZONE_SPEED_LIMIT_KMH))


def _derive_queue_counter_id(source_ref: str) -> str:
    return f"COUNTER-{_stable_hash_int(source_ref, start=2, length=2) % 6 + 1:02d}"


def _derive_queue_max_limit(source_ref: str, zone: str) -> int:
    zone_limits = {
        "Restricted Bay": 4,
        "Dock Lane": 5,
        "Zone 1": 6,
        "Zone 2": 7,
        "Zone 3": 8,
    }
    return int(zone_limits.get(zone, DEFAULT_QUEUE_MAX_LIMIT))


def _persist_ppe_analytics(
    *,
    result: dict[str, Any],
    filename: str,
    job_id: int | None = None,
    integration_run_id: int | None = None,
    input_bucket: str | None = None,
    input_object_key: str | None = None,
    output_object_key: str | None = None,
    output_video_link: str | None = None,
    run_status: str = "processed",
) -> dict[str, Any] | None:
    analytics = result.get("analytics") if isinstance(result, dict) else None
    if not isinstance(analytics, dict):
        return None

    video_summary = analytics.get("video_summary", {}) if isinstance(analytics.get("video_summary"), dict) else {}
    person_summaries = analytics.get("person_summaries", []) if isinstance(analytics.get("person_summaries"), list) else []

    minio_video_link = _build_minio_uri(input_bucket, input_object_key)
    stable_output_link = _build_minio_uri(input_bucket, output_object_key) or output_video_link
    source_ref = minio_video_link or (f"job://ppe/{job_id}" if job_id is not None else f"file://{filename}")
    simulated_timestamp = str(video_summary.get("simulated_timestamp") or _utc_now_iso())
    source_metadata = _derive_demo_source_metadata(source_ref, simulated_timestamp)

    input_row = upsert_ppe_detection_input(
        source_ref=source_ref,
        integration_run_id=integration_run_id,
        job_id=job_id,
        camera_id=source_metadata["camera_id"],
        location=source_metadata["location"],
        zone=source_metadata["zone"],
        shift=source_metadata["shift"],
        filename=filename,
        minio_video_link=minio_video_link,
        output_video_link=stable_output_link,
        input_bucket=input_bucket,
        input_object_key=input_object_key,
        output_object_key=output_object_key,
        load_time_sec=video_summary.get("duration_sec"),
        processing_time_sec=video_summary.get("processing_time_sec"),
        simulated_timestamp=simulated_timestamp,
        run_status=run_status,
        metadata_json={
            "frame_count": video_summary.get("frame_count"),
            "fps": video_summary.get("fps"),
            "metrics": result.get("metrics", {}),
            "source_type": "minio" if minio_video_link else "local",
        },
    )

    output_rows = replace_ppe_detection_outputs(
        input_id=int(input_row["input_id"]),
        outputs=[
            {
                "person_id": str(person.get("person_id")),
                "helmet_worn": person.get("helmet_worn"),
                "vest_worn": person.get("vest_worn"),
                "shoes_worn": person.get("shoes_worn"),
                "violation_type": person.get("violation_type"),
                "confidence_score": person.get("confidence_score"),
                "status": person.get("status", "unknown"),
                "first_seen_frame": person.get("first_seen_frame"),
                "last_seen_frame": person.get("last_seen_frame"),
                "first_seen_sec": person.get("first_seen_sec"),
                "last_seen_sec": person.get("last_seen_sec"),
                "notes": person.get("notes", ""),
                "metadata_json": person.get("metadata", {}),
            }
            for person in person_summaries
        ],
    )

    return {
        "input_row": input_row,
        "output_rows": output_rows,
    }


def _persist_region_alert_analytics(
    *,
    result: dict[str, Any],
    filename: str,
    job_id: int | None = None,
    integration_run_id: int | None = None,
    input_bucket: str | None = None,
    input_object_key: str | None = None,
    output_object_key: str | None = None,
    output_video_link: str | None = None,
    run_status: str = "processed",
) -> dict[str, Any] | None:
    analytics = result.get("analytics") if isinstance(result, dict) else None
    if not isinstance(analytics, dict):
        return None

    video_summary = analytics.get("video_summary", {}) if isinstance(analytics.get("video_summary"), dict) else {}
    intrusion_summaries = analytics.get("intrusion_summaries", []) if isinstance(analytics.get("intrusion_summaries"), list) else []

    minio_video_link = _build_minio_uri(input_bucket, input_object_key)
    stable_output_link = _build_minio_uri(input_bucket, output_object_key) or output_video_link
    source_ref = minio_video_link or (f"job://region-alerts/{job_id}" if job_id is not None else f"file://{filename}")
    simulated_timestamp = str(video_summary.get("simulated_timestamp") or _utc_now_iso())
    source_metadata = _derive_demo_source_metadata(source_ref, simulated_timestamp)

    input_row = upsert_region_alert_input(
        source_ref=source_ref,
        integration_run_id=integration_run_id,
        job_id=job_id,
        camera_id=source_metadata["camera_id"],
        location=source_metadata["location"],
        zone=source_metadata["zone"],
        zone_type=str(video_summary.get("zone_type") or "restricted"),
        filename=filename,
        minio_video_link=minio_video_link,
        output_video_link=stable_output_link,
        input_bucket=input_bucket,
        input_object_key=input_object_key,
        output_object_key=output_object_key,
        load_time_sec=video_summary.get("duration_sec"),
        processing_time_sec=video_summary.get("processing_time_sec"),
        simulated_timestamp=simulated_timestamp,
        run_status=run_status,
        metadata_json={
            "frame_count": video_summary.get("frame_count"),
            "fps": video_summary.get("fps"),
            "metrics": result.get("metrics", {}),
            "source_type": "minio" if minio_video_link else "local",
        },
    )

    output_rows = replace_region_alert_outputs(
        input_id=int(input_row["input_id"]),
        outputs=[
            {
                "object_type": event.get("object_type", "person"),
                "authorized": event.get("authorized"),
                "entry_time": event.get("entry_time"),
                "exit_time": event.get("exit_time"),
                "duration_sec": event.get("duration_sec"),
                "alert_type": event.get("alert_type", "zone_intrusion"),
                "severity": event.get("severity", "low"),
                "confidence_score": event.get("confidence_score"),
                "status": event.get("status", "violation"),
                "notes": event.get("notes", ""),
                "metadata_json": event.get("metadata", {}),
            }
            for event in intrusion_summaries
        ],
    )

    return {
        "input_row": input_row,
        "output_rows": output_rows,
    }


def _persist_fire_detection_analytics(
    *,
    result: dict[str, Any],
    filename: str,
    job_id: int | None = None,
    integration_run_id: int | None = None,
    input_bucket: str | None = None,
    input_object_key: str | None = None,
    output_object_key: str | None = None,
    output_video_link: str | None = None,
    run_status: str = "processed",
) -> dict[str, Any] | None:
    analytics = result.get("analytics") if isinstance(result, dict) else None
    if not isinstance(analytics, dict):
        return None

    video_summary = analytics.get("video_summary", {}) if isinstance(analytics.get("video_summary"), dict) else {}
    alert_summary = analytics.get("alert_summary", {}) if isinstance(analytics.get("alert_summary"), dict) else {}

    minio_video_link = _build_minio_uri(input_bucket, input_object_key)
    stable_output_link = _build_minio_uri(input_bucket, output_object_key) or output_video_link
    source_ref = minio_video_link or (f"job://fire-detection/{job_id}" if job_id is not None else f"file://{filename}")
    simulated_timestamp = str(video_summary.get("simulated_timestamp") or _utc_now_iso())
    source_metadata = _derive_demo_source_metadata(source_ref, simulated_timestamp)

    input_row = upsert_fire_detection_input(
        source_ref=source_ref,
        integration_run_id=integration_run_id,
        job_id=job_id,
        camera_id=source_metadata["camera_id"],
        location=source_metadata["location"],
        zone=source_metadata["zone"],
        filename=filename,
        minio_video_link=minio_video_link,
        output_video_link=stable_output_link,
        input_bucket=input_bucket,
        input_object_key=input_object_key,
        output_object_key=output_object_key,
        load_time_sec=video_summary.get("duration_sec"),
        processing_time_sec=video_summary.get("processing_time_sec"),
        simulated_timestamp=simulated_timestamp,
        run_status=run_status,
        metadata_json={
            "frame_count": video_summary.get("frame_count"),
            "fps": video_summary.get("fps"),
            "metrics": result.get("metrics", {}),
            "source_type": "minio" if minio_video_link else "local",
        },
    )

    output_rows = replace_fire_detection_outputs(
        input_id=int(input_row["input_id"]),
        outputs=[
            {
                "fire_detected": alert_summary.get("fire_detected"),
                "smoke_detected": alert_summary.get("smoke_detected"),
                "severity": alert_summary.get("severity"),
                "alert_type": alert_summary.get("alert_type"),
                "confidence_score": alert_summary.get("confidence_score"),
                "response_time_sec": alert_summary.get("response_time_sec"),
                "status": alert_summary.get("status", "clear"),
                "notes": alert_summary.get("notes", ""),
                "metadata_json": alert_summary.get("metadata", {}),
            }
        ],
    )

    return {
        "input_row": input_row,
        "output_rows": output_rows,
    }


def _persist_crack_detection_analytics(
    *,
    result: dict[str, Any],
    filename: str,
    job_id: int | None = None,
    integration_run_id: int | None = None,
    input_bucket: str | None = None,
    input_object_key: str | None = None,
    output_object_key: str | None = None,
    output_video_link: str | None = None,
    run_status: str = "processed",
) -> dict[str, Any] | None:
    analytics = result.get("analytics") if isinstance(result, dict) else None
    if not isinstance(analytics, dict):
        return None

    video_summary = analytics.get("video_summary", {}) if isinstance(analytics.get("video_summary"), dict) else {}
    crack_events = analytics.get("crack_events", []) if isinstance(analytics.get("crack_events"), list) else []
    metrics = result.get("metrics", {}) if isinstance(result.get("metrics"), dict) else {}

    minio_input_link = _build_minio_uri(input_bucket, input_object_key)
    stable_output_link = _build_minio_uri(input_bucket, output_object_key) or output_video_link
    source_ref = minio_input_link or (f"job://crack-detection/{job_id}" if job_id is not None else f"file://{filename}")
    simulated_timestamp = str(video_summary.get("simulated_timestamp") or _utc_now_iso())
    processed_at = _utc_now_iso()
    source_metadata = _derive_persisted_context(
        use_case_id="crack-detection",
        source_ref=source_ref,
        simulated_timestamp=simulated_timestamp,
    )
    persisted_filename = _derive_persisted_filename(
        filename=filename,
        input_object_key=input_object_key,
        source_ref=source_ref,
    )

    severity_rank = {"low": 1, "medium": 2, "high": 3}
    dominant_severity = "normal"
    for event in crack_events:
        event_severity = str(event.get("severity") or "").strip().lower()
        if severity_rank.get(event_severity, 0) > severity_rank.get(dominant_severity, 0):
            dominant_severity = event_severity

    input_row = upsert_crack_detection_input(
        source_ref=source_ref,
        integration_run_id=integration_run_id,
        job_id=job_id,
        camera_id=source_metadata["camera_id"],
        location=source_metadata["location"],
        zone=source_metadata["zone"],
        filename=persisted_filename,
        minio_input_link=minio_input_link,
        output_media_link=stable_output_link,
        output_video_link=stable_output_link,
        input_bucket=input_bucket,
        input_object_key=input_object_key,
        output_object_key=output_object_key,
        load_time_sec=video_summary.get("duration_sec"),
        processing_time_sec=video_summary.get("processing_time_sec"),
        simulated_timestamp=simulated_timestamp,
        processed_at=processed_at,
        run_status=run_status,
        metadata_json={
            "generated_context": bool(source_metadata.get("generated_context")),
            "generated_fields": list(source_metadata.get("generated_fields") or []),
            "frame_count": video_summary.get("frame_count"),
            "fps": video_summary.get("fps"),
            "metrics": metrics,
            "crack_events": crack_events,
            "defect_events": crack_events,
            "source_type": "minio" if minio_input_link else "local",
            "minio_input_link": minio_input_link,
            "output_media_link": stable_output_link,
        },
    )

    crack_count = int(metrics.get("crack_detections") or len(crack_events) or 0)

    output_rows = replace_crack_detection_outputs(
        input_id=int(input_row["input_id"]),
        outputs=[
            {
                "crack_detected": crack_count > 0,
                "crack_count": crack_count,
                "frames_analyzed": metrics.get("frames_analyzed"),
                "frames_with_cracks": metrics.get("frames_with_cracks"),
                "crack_rate_pct": metrics.get("crack_rate_pct"),
                "max_confidence": metrics.get("max_confidence"),
                "avg_confidence": metrics.get("avg_confidence"),
                "severity": dominant_severity,
                "status": "open" if crack_count > 0 else "clear",
                "metadata_json": {
                    "defect_events": crack_events,
                    "crack_events": crack_events,
                    "video_summary": video_summary,
                    "frames_analyzed": metrics.get("frames_analyzed"),
                    "frames_with_cracks": metrics.get("frames_with_cracks"),
                    "crack_rate_pct": metrics.get("crack_rate_pct"),
                    "output_media_link": stable_output_link,
                },
            }
        ],
    )

    return {
        "input_row": input_row,
        "output_rows": output_rows,
    }


def _persist_unsafe_behavior_analytics(
    *,
    result: dict[str, Any],
    filename: str,
    job_id: int | None = None,
    integration_run_id: int | None = None,
    input_bucket: str | None = None,
    input_object_key: str | None = None,
    output_object_key: str | None = None,
    output_video_link: str | None = None,
    run_status: str = "processed",
) -> dict[str, Any] | None:
    analytics = result.get("analytics") if isinstance(result, dict) else None
    if not isinstance(analytics, dict):
        return None

    video_summary = analytics.get("video_summary", {}) if isinstance(analytics.get("video_summary"), dict) else {}
    unsafe_events = analytics.get("unsafe_events", []) if isinstance(analytics.get("unsafe_events"), list) else []
    metrics = result.get("metrics", {}) if isinstance(result.get("metrics"), dict) else {}

    minio_input_link = _build_minio_uri(input_bucket, input_object_key)
    stable_output_link = _build_minio_uri(input_bucket, output_object_key) or output_video_link
    source_ref = minio_input_link or (
        f"job://unsafe-behavior-detection/{job_id}" if job_id is not None else f"file://{filename}"
    )
    simulated_timestamp = str(video_summary.get("simulated_timestamp") or _utc_now_iso())
    processed_at = _utc_now_iso()
    source_metadata = _derive_persisted_context(
        use_case_id="unsafe-behavior-detection",
        source_ref=source_ref,
        simulated_timestamp=simulated_timestamp,
    )
    persisted_filename = _derive_persisted_filename(
        filename=filename,
        input_object_key=input_object_key,
        source_ref=source_ref,
    )

    input_row = upsert_unsafe_behavior_input(
        source_ref=source_ref,
        integration_run_id=integration_run_id,
        job_id=job_id,
        camera_id=source_metadata["camera_id"],
        location=source_metadata["location"],
        zone=source_metadata["zone"],
        filename=persisted_filename,
        minio_input_link=minio_input_link,
        output_media_link=stable_output_link,
        output_video_link=stable_output_link,
        input_bucket=input_bucket,
        input_object_key=input_object_key,
        output_object_key=output_object_key,
        load_time_sec=video_summary.get("duration_sec"),
        processing_time_sec=video_summary.get("processing_time_sec"),
        simulated_timestamp=simulated_timestamp,
        processed_at=processed_at,
        run_status=run_status,
        metadata_json={
            "generated_context": bool(source_metadata.get("generated_context")),
            "generated_fields": list(source_metadata.get("generated_fields") or []),
            "frame_count": video_summary.get("frame_count"),
            "fps": video_summary.get("fps"),
            "metrics": metrics,
            "unsafe_events": unsafe_events,
            "source_type": "minio" if minio_input_link else "local",
            "minio_input_link": minio_input_link,
            "output_media_link": stable_output_link,
        },
    )

    output_rows = replace_unsafe_behavior_outputs(
        input_id=int(input_row["input_id"]),
        outputs=[
            {
                "event_type": str(event.get("event_type") or "unsafe"),
                "confidence": event.get("confidence"),
                "bbox_json": event.get("bbox") or [],
                "source": event.get("source"),
                "associated_person_box_json": event.get("associated_person_box") or [],
                "severity": event.get("severity"),
                "status": event.get("status") or "open",
                "frame_number": event.get("frame_number"),
                "timestamp_sec": event.get("timestamp_sec"),
                "metadata_json": {
                    "video_summary": video_summary,
                    "summary_metrics": metrics,
                    "source": event.get("source"),
                    "output_media_link": stable_output_link,
                    "evidence": {
                        "bbox": event.get("bbox") or [],
                        "associated_person_box": event.get("associated_person_box") or [],
                    },
                },
            }
            for event in unsafe_events
            if isinstance(event, dict)
        ],
    )

    return {
        "input_row": input_row,
        "output_rows": output_rows,
    }


def _persist_speed_estimation_analytics(
    *,
    result: dict[str, Any],
    filename: str,
    job_id: int | None = None,
    integration_run_id: int | None = None,
    input_bucket: str | None = None,
    input_object_key: str | None = None,
    output_object_key: str | None = None,
    output_video_link: str | None = None,
    run_status: str = "processed",
) -> dict[str, Any] | None:
    analytics = result.get("analytics") if isinstance(result, dict) else None
    if not isinstance(analytics, dict):
        return None

    video_summary = analytics.get("video_summary", {}) if isinstance(analytics.get("video_summary"), dict) else {}
    speed_summaries = analytics.get("speed_summaries", []) if isinstance(analytics.get("speed_summaries"), list) else []

    minio_video_link = _build_minio_uri(input_bucket, input_object_key)
    stable_output_link = _build_minio_uri(input_bucket, output_object_key) or output_video_link
    source_ref = minio_video_link or (f"job://speed-estimation/{job_id}" if job_id is not None else f"file://{filename}")
    simulated_timestamp = str(video_summary.get("simulated_timestamp") or _utc_now_iso())
    source_metadata = _derive_demo_source_metadata(source_ref, simulated_timestamp)
    zone_speed_limit_kmh = float(video_summary.get("zone_speed_limit_kmh") or _derive_zone_speed_limit_kmh(source_ref, source_metadata["zone"]))

    input_row = upsert_speed_estimation_input(
        source_ref=source_ref,
        integration_run_id=integration_run_id,
        job_id=job_id,
        camera_id=source_metadata["camera_id"],
        location=source_metadata["location"],
        zone=source_metadata["zone"],
        zone_speed_limit_kmh=zone_speed_limit_kmh,
        filename=filename,
        minio_video_link=minio_video_link,
        output_video_link=stable_output_link,
        input_bucket=input_bucket,
        input_object_key=input_object_key,
        output_object_key=output_object_key,
        load_time_sec=video_summary.get("duration_sec"),
        processing_time_sec=video_summary.get("processing_time_sec"),
        simulated_timestamp=simulated_timestamp,
        run_status=run_status,
        metadata_json={
            "frame_count": video_summary.get("frame_count"),
            "fps": video_summary.get("fps"),
            "metrics": result.get("metrics", {}),
            "source_type": "minio" if minio_video_link else "local",
        },
    )

    output_rows = replace_speed_estimation_outputs(
        input_id=int(input_row["input_id"]),
        outputs=[
            {
                "object_id": summary.get("object_id"),
                "object_type": summary.get("object_type"),
                "detected_speed_kmh": summary.get("detected_speed_kmh"),
                "speed_limit_kmh": summary.get("speed_limit_kmh", zone_speed_limit_kmh),
                "is_overspeeding": summary.get("is_overspeeding"),
                "excess_speed_kmh": summary.get("excess_speed_kmh"),
                "confidence_score": summary.get("confidence_score"),
                "status": summary.get("status", "normal"),
                "notes": summary.get("notes", ""),
                "metadata_json": {
                    **(summary.get("metadata", {}) if isinstance(summary.get("metadata"), dict) else {}),
                    "crossed_line": summary.get("crossed_line"),
                    "class_count_for_type": summary.get("class_count_for_type"),
                    "direction": summary.get("direction"),
                },
            }
            for summary in speed_summaries
        ],
    )

    return {
        "input_row": input_row,
        "output_rows": output_rows,
    }


def _persist_queue_management_analytics(
    *,
    result: dict[str, Any],
    filename: str,
    job_id: int | None = None,
    integration_run_id: int | None = None,
    input_bucket: str | None = None,
    input_object_key: str | None = None,
    output_object_key: str | None = None,
    output_video_link: str | None = None,
    run_status: str = "processed",
) -> dict[str, Any] | None:
    analytics = result.get("analytics") if isinstance(result, dict) else None
    if not isinstance(analytics, dict):
        return None

    video_summary = analytics.get("video_summary", {}) if isinstance(analytics.get("video_summary"), dict) else {}
    queue_summaries = analytics.get("queue_summaries", []) if isinstance(analytics.get("queue_summaries"), list) else []

    minio_video_link = _build_minio_uri(input_bucket, input_object_key)
    stable_output_link = _build_minio_uri(input_bucket, output_object_key) or output_video_link
    source_ref = minio_video_link or (f"job://queue-management/{job_id}" if job_id is not None else f"file://{filename}")
    simulated_timestamp = str(video_summary.get("simulated_timestamp") or _utc_now_iso())
    source_metadata = _derive_demo_source_metadata(source_ref, simulated_timestamp)
    counter_id = str(video_summary.get("counter_id") or _derive_queue_counter_id(source_ref))
    max_queue_limit = int(video_summary.get("max_queue_limit") or _derive_queue_max_limit(source_ref, source_metadata["zone"]))

    input_row = upsert_queue_management_input(
        source_ref=source_ref,
        integration_run_id=integration_run_id,
        job_id=job_id,
        camera_id=source_metadata["camera_id"],
        location=source_metadata["location"],
        zone=source_metadata["zone"],
        counter_id=counter_id,
        max_queue_limit=max_queue_limit,
        filename=filename,
        minio_video_link=minio_video_link,
        output_video_link=stable_output_link,
        input_bucket=input_bucket,
        input_object_key=input_object_key,
        output_object_key=output_object_key,
        load_time_sec=video_summary.get("duration_sec"),
        processing_time_sec=video_summary.get("processing_time_sec"),
        simulated_timestamp=simulated_timestamp,
        run_status=run_status,
        metadata_json={
            "frame_count": video_summary.get("frame_count"),
            "fps": video_summary.get("fps"),
            "metrics": result.get("metrics", {}),
            "source_type": "minio" if minio_video_link else "local",
        },
    )

    output_rows = replace_queue_management_outputs(
        input_id=int(input_row["input_id"]),
        outputs=[
            {
                "queue_length": summary.get("queue_length"),
                "estimated_wait_sec": summary.get("estimated_wait_sec"),
                "is_breached": summary.get("is_breached"),
                "excess_count": summary.get("excess_count"),
                "staff_count": summary.get("staff_count"),
                "confidence_score": summary.get("confidence_score"),
                "status": summary.get("status", "normal"),
                "notes": summary.get("notes", ""),
                "metadata_json": summary.get("metadata", {}),
            }
            for summary in queue_summaries
        ],
    )

    return {
        "input_row": input_row,
        "output_rows": output_rows,
    }


def _persist_class_wise_object_counting_analytics(
    *,
    result: dict[str, Any],
    filename: str,
    job_id: int | None = None,
    integration_run_id: int | None = None,
    input_bucket: str | None = None,
    input_object_key: str | None = None,
    output_object_key: str | None = None,
    output_video_link: str | None = None,
    run_status: str = "processed",
) -> dict[str, Any] | None:
    analytics = result.get("analytics") if isinstance(result, dict) else None
    if not isinstance(analytics, dict):
        return None

    video_summary = analytics.get("video_summary", {}) if isinstance(analytics.get("video_summary"), dict) else {}
    class_summaries = analytics.get("class_summaries", []) if isinstance(analytics.get("class_summaries"), list) else []

    minio_video_link = _build_minio_uri(input_bucket, input_object_key)
    stable_output_link = _build_minio_uri(input_bucket, output_object_key) or output_video_link
    source_ref = minio_video_link or (f"job://class-wise-object-counting/{job_id}" if job_id is not None else f"file://{filename}")
    simulated_timestamp = str(video_summary.get("simulated_timestamp") or _utc_now_iso())
    source_metadata = _derive_demo_source_metadata(source_ref, simulated_timestamp)

    input_row = upsert_class_wise_object_counting_input(
        source_ref=source_ref,
        integration_run_id=integration_run_id,
        job_id=job_id,
        camera_id=source_metadata["camera_id"],
        location=source_metadata["location"],
        zone=source_metadata["zone"],
        filename=filename,
        minio_video_link=minio_video_link,
        output_video_link=stable_output_link,
        input_bucket=input_bucket,
        input_object_key=input_object_key,
        output_object_key=output_object_key,
        load_time_sec=video_summary.get("duration_sec"),
        processing_time_sec=video_summary.get("processing_time_sec"),
        simulated_timestamp=simulated_timestamp,
        run_status=run_status,
        metadata_json={
            "frame_count": video_summary.get("frame_count"),
            "fps": video_summary.get("fps"),
            "metrics": result.get("metrics", {}),
            "source_type": "minio" if minio_video_link else "local",
        },
    )

    output_rows = replace_class_wise_object_counting_outputs(
        input_id=int(input_row["input_id"]),
        outputs=[
            {
                "class_name": summary.get("class_name"),
                "class_count": summary.get("class_count"),
                "expected_count": summary.get("expected_count"),
                "count_difference": summary.get("count_difference"),
                "total_objects_in_frame": summary.get("total_objects_in_frame"),
                "class_percentage": summary.get("class_percentage"),
                "confidence_score": summary.get("confidence_score"),
                "status": summary.get("status", "matched"),
                "notes": summary.get("notes", ""),
                "metadata_json": summary.get("metadata", {}),
            }
            for summary in class_summaries
        ],
    )

    return {
        "input_row": input_row,
        "output_rows": output_rows,
    }


def _persist_object_tracking_analytics(
    *,
    result: dict[str, Any],
    filename: str,
    job_id: int | None = None,
    integration_run_id: int | None = None,
    input_bucket: str | None = None,
    input_object_key: str | None = None,
    output_object_key: str | None = None,
    output_video_link: str | None = None,
    run_status: str = "processed",
) -> dict[str, Any] | None:
    analytics = result.get("analytics") if isinstance(result, dict) else None
    if not isinstance(analytics, dict):
        return None

    video_summary = analytics.get("video_summary", {}) if isinstance(analytics.get("video_summary"), dict) else {}
    track_summaries = analytics.get("track_summaries", []) if isinstance(analytics.get("track_summaries"), list) else []

    minio_video_link = _build_minio_uri(input_bucket, input_object_key)
    stable_output_link = _build_minio_uri(input_bucket, output_object_key) or output_video_link
    source_ref = minio_video_link or (f"job://object-tracking/{job_id}" if job_id is not None else f"file://{filename}")
    simulated_timestamp = str(video_summary.get("simulated_timestamp") or _utc_now_iso())
    source_metadata = _derive_demo_source_metadata(source_ref, simulated_timestamp)

    input_row = upsert_object_tracking_input(
        source_ref=source_ref,
        integration_run_id=integration_run_id,
        job_id=job_id,
        camera_id=source_metadata["camera_id"],
        location=source_metadata["location"],
        zone=source_metadata["zone"],
        filename=filename,
        minio_video_link=minio_video_link,
        output_video_link=stable_output_link,
        input_bucket=input_bucket,
        input_object_key=input_object_key,
        output_object_key=output_object_key,
        load_time_sec=video_summary.get("duration_sec"),
        processing_time_sec=video_summary.get("processing_time_sec"),
        simulated_timestamp=simulated_timestamp,
        run_status=run_status,
        metadata_json={
            "frame_count": video_summary.get("frame_count"),
            "fps": video_summary.get("fps"),
            "metrics": result.get("metrics", {}),
            "source_type": "minio" if minio_video_link else "local",
        },
    )

    output_rows = replace_object_tracking_outputs(
        input_id=int(input_row["input_id"]),
        outputs=[
            {
                "object_id": summary.get("object_id"),
                "object_type": summary.get("object_type"),
                "entry_time": summary.get("entry_time"),
                "exit_time": summary.get("exit_time"),
                "duration_in_zone_sec": summary.get("duration_in_zone_sec"),
                "next_zone": summary.get("next_zone"),
                "path_sequence": summary.get("path_sequence"),
                "is_anomaly": summary.get("is_anomaly"),
                "confidence_score": summary.get("confidence_score"),
                "status": summary.get("status", "normal"),
                "notes": summary.get("notes", ""),
                "metadata_json": summary.get("metadata", {}),
            }
            for summary in track_summaries
        ],
    )

    return {
        "input_row": input_row,
        "output_rows": output_rows,
    }


def _persist_use_case_analytics(
    *,
    use_case_id: str,
    result: dict[str, Any],
    filename: str,
    job_id: int | None = None,
    integration_run_id: int | None = None,
    input_bucket: str | None = None,
    input_object_key: str | None = None,
    output_object_key: str | None = None,
    output_video_link: str | None = None,
    run_status: str = "processed",
) -> dict[str, Any] | None:
    canonical_use_case_id = _normalize_integration_use_case_id(use_case_id)
    if canonical_use_case_id == "ppe-detection":
        return _persist_ppe_analytics(
            result=result,
            filename=filename,
            job_id=job_id,
            integration_run_id=integration_run_id,
            input_bucket=input_bucket,
            input_object_key=input_object_key,
            output_object_key=output_object_key,
            output_video_link=output_video_link,
            run_status=run_status,
        )
    if canonical_use_case_id == "region-alerts":
        return _persist_region_alert_analytics(
            result=result,
            filename=filename,
            job_id=job_id,
            integration_run_id=integration_run_id,
            input_bucket=input_bucket,
            input_object_key=input_object_key,
            output_object_key=output_object_key,
            output_video_link=output_video_link,
            run_status=run_status,
        )
    if canonical_use_case_id == "fire-detection":
        return _persist_fire_detection_analytics(
            result=result,
            filename=filename,
            job_id=job_id,
            integration_run_id=integration_run_id,
            input_bucket=input_bucket,
            input_object_key=input_object_key,
            output_object_key=output_object_key,
            output_video_link=output_video_link,
            run_status=run_status,
        )
    if canonical_use_case_id == "crack-detection":
        return _persist_crack_detection_analytics(
            result=result,
            filename=filename,
            job_id=job_id,
            integration_run_id=integration_run_id,
            input_bucket=input_bucket,
            input_object_key=input_object_key,
            output_object_key=output_object_key,
            output_video_link=output_video_link,
            run_status=run_status,
        )
    if canonical_use_case_id == "unsafe-behavior-detection":
        return _persist_unsafe_behavior_analytics(
            result=result,
            filename=filename,
            job_id=job_id,
            integration_run_id=integration_run_id,
            input_bucket=input_bucket,
            input_object_key=input_object_key,
            output_object_key=output_object_key,
            output_video_link=output_video_link,
            run_status=run_status,
        )
    if canonical_use_case_id == "speed-estimation":
        return _persist_speed_estimation_analytics(
            result=result,
            filename=filename,
            job_id=job_id,
            integration_run_id=integration_run_id,
            input_bucket=input_bucket,
            input_object_key=input_object_key,
            output_object_key=output_object_key,
            output_video_link=output_video_link,
            run_status=run_status,
        )
    if canonical_use_case_id == "queue-management":
        return _persist_queue_management_analytics(
            result=result,
            filename=filename,
            job_id=job_id,
            integration_run_id=integration_run_id,
            input_bucket=input_bucket,
            input_object_key=input_object_key,
            output_object_key=output_object_key,
            output_video_link=output_video_link,
            run_status=run_status,
        )
    if canonical_use_case_id == "class-wise-object-counting":
        return _persist_class_wise_object_counting_analytics(
            result=result,
            filename=filename,
            job_id=job_id,
            integration_run_id=integration_run_id,
            input_bucket=input_bucket,
            input_object_key=input_object_key,
            output_object_key=output_object_key,
            output_video_link=output_video_link,
            run_status=run_status,
        )
    if canonical_use_case_id == "object-tracking":
        return _persist_object_tracking_analytics(
            result=result,
            filename=filename,
            job_id=job_id,
            integration_run_id=integration_run_id,
            input_bucket=input_bucket,
            input_object_key=input_object_key,
            output_object_key=output_object_key,
            output_video_link=output_video_link,
            run_status=run_status,
        )
    return None


def _build_integration_overview(
    *,
    use_case_id: str,
    limit: int = INTEGRATION_OVERVIEW_LIMIT,
) -> MinioIntegrationOverviewResponse:
    canonical_use_case_id = _normalize_integration_use_case_id(use_case_id)
    snapshot = _get_integration_state(canonical_use_case_id)
    config = snapshot.get("connection")
    credential_mode = str(snapshot.get("credential_mode") or "direct")
    connected_at = snapshot.get("connected_at")
    processing_mode = str(snapshot.get("processing_mode") or "manual")
    model_mode = str(snapshot.get("model_mode") or "active")
    model_version_id = snapshot.get("model_version_id")
    model_mode_used = snapshot.get("model_mode_used")
    model_path_used = snapshot.get("model_path_used")
    fallback_used = bool(snapshot.get("fallback_used"))
    fallback_reason = snapshot.get("fallback_reason")
    use_case_title = _get_integration_use_case_title(canonical_use_case_id)

    overview = MinioIntegrationOverviewResponse(
        connected=bool(snapshot.get("connected")),
        processing=bool(snapshot.get("processing")),
        message=str(snapshot.get("message") or ""),
        last_sync_at=snapshot.get("last_sync_at"),
        connection=_build_connection_details(
            config,
            use_case_id=canonical_use_case_id,
            connected_at=connected_at,
            credential_mode=credential_mode,
            processing_mode=processing_mode,
            model_mode=model_mode,
            model_version_id=model_version_id,
            model_mode_used=model_mode_used,
            model_path_used=model_path_used,
            fallback_used=fallback_used,
            fallback_reason=fallback_reason,
            zone_points_normalized=snapshot.get("zone_points_normalized") if canonical_use_case_id == "region-alerts" else None,
            rule_config=snapshot.get("rule_config") if canonical_use_case_id == "region-alerts" else None,
        ) if config else None,
    )

    if not overview.connected or config is None:
        return overview

    try:
        client = create_client(config)
        validate_bucket_access(client, config.bucket)
        input_objects = _list_integration_objects(
            client=client,
            bucket=config.bucket,
            prefix=config.input_prefix,
            use_case_id=canonical_use_case_id,
        )
        output_objects = _list_integration_objects(
            client=client,
            bucket=config.bucket,
            prefix=config.output_prefix,
            use_case_id=canonical_use_case_id,
        )
        all_runs = list_integration_runs(
            limit=50,
            provider=INTEGRATION_PROVIDER,
            use_case_id=canonical_use_case_id,
            bucket=config.bucket,
        )
    except Exception as error:
        overview.message = overview.message or f"Connected, but unable to load MinIO objects: {error}"
        return overview

    run_by_input = {str(run["input_key"]): run for run in all_runs}
    run_by_output = {str(run["output_key"]): run for run in all_runs if str(run["output_key"])}

    recent_runs = [_build_recent_run_item(run, client) for run in all_runs[:limit]]

    input_items: list[IntegrationVideoItem] = []
    for item in input_objects[:limit]:
        expected_output_key = build_output_object_key(
            str(item["object_key"]),
            config.input_prefix,
            config.output_prefix,
            use_case_suffix=_get_integration_output_suffix(canonical_use_case_id),
        )
        run = run_by_input.get(str(item["object_key"]))
        status = str(run["status"]) if run else ("completed" if object_exists(client, config.bucket, expected_output_key) else "available")
        updated_at = str(run["updated_at"]) if run else None
        input_items.append(
            IntegrationVideoItem(
                object_key=str(item["object_key"]),
                name=str(item["name"]),
                size_bytes=int(item["size_bytes"]),
                last_modified=item["last_modified"],
                status=status,
                preview_url=_build_integration_proxy_url(canonical_use_case_id, str(item["object_key"])),
                output_url=None,
                output_key=str(run["output_key"]) if run else expected_output_key,
                updated_at=updated_at,
            )
        )

    output_items: list[IntegrationVideoItem] = []
    for item in output_objects[:limit]:
        run = run_by_output.get(str(item["object_key"]))
        output_items.append(
            IntegrationVideoItem(
                object_key=str(item["object_key"]),
                name=str(item["name"]),
                size_bytes=int(item["size_bytes"]),
                last_modified=item["last_modified"],
                status=str(run["status"]) if run else "completed",
                preview_url=_build_integration_proxy_url(canonical_use_case_id, str(item["object_key"])),
                output_url=_build_integration_proxy_url(canonical_use_case_id, str(item["object_key"])),
                source_input_key=str(run["input_key"]) if run else None,
                updated_at=str(run["updated_at"]) if run else item["last_modified"],
            )
        )

    overview.recent_runs = recent_runs
    overview.input_videos = input_items
    overview.output_videos = output_items
    overview.summary = {
        "input_videos": len(input_objects),
        "output_videos": len(output_objects),
        "completed_runs": sum(1 for run in all_runs if str(run["status"]) == "completed"),
        "processing_runs": sum(1 for run in all_runs if str(run["status"]) in {"queued", "processing"}),
    }
    if not overview.message and overview.connected:
        overview.message = f"{use_case_title} integration is scoped to {config.input_prefix} and {config.output_prefix}."
    return overview


def _build_manual_input_video_items(
    *,
    use_case_id: str,
    limit: int,
) -> tuple[list[IntegrationVideoItem], int]:
    canonical_use_case_id = _normalize_integration_use_case_id(use_case_id)
    snapshot = _get_integration_state(canonical_use_case_id)
    config = snapshot.get("connection")

    if not snapshot.get("connected") or config is None:
        raise HTTPException(status_code=400, detail="Connect to MinIO before fetching input files.")

    try:
        client = create_client(config)
        validate_bucket_access(client, config.bucket)
        input_objects = _list_integration_objects(
            client=client,
            bucket=config.bucket,
            prefix=config.input_prefix,
            use_case_id=canonical_use_case_id,
        )
        all_runs = list_integration_runs(
            limit=500,
            provider=INTEGRATION_PROVIDER,
            use_case_id=canonical_use_case_id,
            bucket=config.bucket,
        )
    except Exception as error:
        raise HTTPException(status_code=400, detail=f"Unable to load MinIO input files: {error}") from error

    run_by_input = {str(run["input_key"]): run for run in all_runs}
    items: list[IntegrationVideoItem] = []

    for item in input_objects[:limit]:
        input_key = str(item["object_key"])
        expected_output_key = build_output_object_key(
            input_key,
            config.input_prefix,
            config.output_prefix,
            use_case_suffix=_get_integration_output_suffix(canonical_use_case_id),
        )
        run = run_by_input.get(input_key)
        has_output = object_exists(client, config.bucket, expected_output_key)
        needs_refresh = _integration_output_needs_refresh(
            canonical_use_case_id,
            run,
            has_output=has_output,
        )
        if needs_refresh:
            status = "available"
        elif run:
            status = str(run.get("status") or "available")
        elif has_output:
            status = "completed"
        else:
            status = "available"

        items.append(
            IntegrationVideoItem(
                object_key=input_key,
                name=str(item["name"]),
                size_bytes=int(item["size_bytes"]),
                last_modified=item["last_modified"],
                status=status,
                preview_url=_build_integration_proxy_url(canonical_use_case_id, input_key),
                output_key=str(run["output_key"]) if run else expected_output_key,
                updated_at=str(run["updated_at"]) if run else item["last_modified"],
            )
        )

    return items, len(input_objects)


def _process_minio_inputs_worker(use_case_id: str) -> None:
    canonical_use_case_id = _normalize_integration_use_case_id(use_case_id)
    snapshot = _get_integration_state(canonical_use_case_id)
    config = snapshot.get("connection")
    processor = get_processor(canonical_use_case_id)
    use_case_title = _get_integration_use_case_title(canonical_use_case_id)

    if not snapshot.get("connected") or config is None:
        _set_integration_state(canonical_use_case_id, processing=False)
        return
    if processor is None:
        _set_integration_state(
            canonical_use_case_id,
            processing=False,
            message=f"{use_case_title} processor is not available.",
        )
        return

    try:
        client = create_client(config)
        validate_bucket_access(client, config.bucket)
    except Exception as error:
        _set_integration_state(
            canonical_use_case_id,
            processing=False,
            message=f"Unable to read MinIO input prefix: {error}",
        )
        return

    auto_model_mode = normalize_model_mode(str(snapshot.get("model_mode") or "active"))
    auto_model_version_id = str(snapshot.get("model_version_id") or "") or None
    auto_model_resolution = resolve_inference_model_path(
        canonical_use_case_id,
        model_mode=auto_model_mode,
        model_version_id=auto_model_version_id,
    )
    found_any_inputs = False

    try:
        while True:
            snapshot = _get_integration_state(canonical_use_case_id)
            current_mode = str(snapshot.get("processing_mode") or "manual")

            try:
                input_objects = _list_integration_objects(
                    client=client,
                    bucket=config.bucket,
                    prefix=config.input_prefix,
                    use_case_id=canonical_use_case_id,
                )
            except Exception as error:
                _set_integration_state(
                    canonical_use_case_id,
                    processing=False,
                    message=f"Unable to read MinIO input prefix: {error}",
                )
                return

            if input_objects:
                found_any_inputs = True

            ordered_inputs = sorted(input_objects, key=lambda item: item["last_modified"] or "")
            next_item: dict[str, object] | None = None
            next_output_key = ""
            next_existing_run: dict[str, Any] | None = None

            for item in ordered_inputs:
                input_key = str(item["object_key"])
                output_key = build_output_object_key(
                    input_key,
                    config.input_prefix,
                    config.output_prefix,
                    use_case_suffix=_get_integration_output_suffix(canonical_use_case_id),
                )
                existing_run = get_integration_run(
                    provider=INTEGRATION_PROVIDER,
                    use_case_id=canonical_use_case_id,
                    bucket=config.bucket,
                    input_key=input_key,
                )
                has_output = object_exists(client, config.bucket, output_key)
                needs_refresh = _integration_output_needs_refresh(
                    canonical_use_case_id,
                    existing_run,
                    has_output=has_output,
                )

                if has_output and not needs_refresh:
                    upsert_integration_run(
                        provider=INTEGRATION_PROVIDER,
                        use_case_id=canonical_use_case_id,
                        bucket=config.bucket,
                        input_key=input_key,
                        output_key=output_key,
                        status="completed",
                        message="Processed output already exists in the MinIO output prefix.",
                        metrics=existing_run.get("metrics", {}) if existing_run else {},
                    )
                    continue

                existing_status = str(existing_run["status"]) if existing_run else ""
                if current_mode == "manual":
                    if existing_status != "queued":
                        continue
                else:
                    if existing_status in {"failed", "processing"}:
                        continue
                    if existing_status == "completed" and not needs_refresh:
                        continue

                next_item = item
                next_output_key = output_key
                next_existing_run = existing_run
                break

            if next_item is None:
                snapshot = _get_integration_state(canonical_use_case_id)
                if snapshot.get("pending_rescan"):
                    _set_integration_state(canonical_use_case_id, pending_rescan=False)
                    continue

                current_mode = str(snapshot.get("processing_mode") or "manual")
                if current_mode == "auto" and snapshot.get("connected"):
                    _set_integration_state(
                        canonical_use_case_id,
                        processing=False,
                        last_sync_at=_utc_now_iso(),
                        message=(
                            f"Auto mode is monitoring {config.input_prefix} for new or "
                            f"unprocessed {use_case_title} videos."
                        ),
                    )
                    if _wait_for_auto_poll_or_rescan(canonical_use_case_id):
                        _set_integration_state(canonical_use_case_id, processing=True)
                        continue
                    return

                completion_message = (
                    f"Connected to MinIO. No {use_case_title} videos were found in the input prefix."
                    if not found_any_inputs
                    else f"Manual mode {use_case_title} processing completed."
                )
                _set_integration_state(
                    canonical_use_case_id,
                    processing=False,
                    last_sync_at=_utc_now_iso(),
                    message=completion_message,
                )
                return

            input_key = str(next_item["object_key"])
            run = upsert_integration_run(
                provider=INTEGRATION_PROVIDER,
                use_case_id=canonical_use_case_id,
                bucket=config.bucket,
                input_key=input_key,
                output_key=next_output_key,
                status="processing",
                message=f"Processing MinIO input video through the {use_case_title} pipeline.",
                metrics=next_existing_run.get("metrics", {}) if next_existing_run else {},
            )

            try:
                with tempfile.TemporaryDirectory() as temp_dir:
                    temp_dir_path = Path(temp_dir)
                    local_input = temp_dir_path / Path(input_key).name
                    local_output = temp_dir_path / Path(next_output_key).name
                    client.fget_object(config.bucket, input_key, str(local_input))

                    model_resolution = auto_model_resolution
                    if current_mode == "manual":
                        existing_metrics = next_existing_run.get("metrics", {}) if next_existing_run else {}
                        requested_model_mode = normalize_model_mode(existing_metrics.get("requested_model_mode"))
                        requested_model_version_id = str(existing_metrics.get("requested_model_version_id") or "") or None
                        model_resolution = resolve_inference_model_path(
                            canonical_use_case_id,
                            model_mode=requested_model_mode,
                            model_version_id=requested_model_version_id,
                        )
                    processor_kwargs: dict[str, Any] = {}
                    if canonical_use_case_id == "region-alerts":
                        integration_state = _get_integration_state(canonical_use_case_id)
                        current_zone_points = integration_state.get("zone_points_normalized")
                        current_rule_config = integration_state.get("rule_config")
                        if current_zone_points:
                            processor_kwargs["zone_points_normalized"] = current_zone_points
                        if current_rule_config:
                            processor_kwargs["rule_config"] = current_rule_config

                    result = processor(
                        input_path=str(local_input),
                        output_path=str(local_output),
                        model_path=str(model_resolution["model_path"]),
                        model_mode=str(model_resolution["model_mode_used"]),
                        device=auto_device(),
                        show=False,
                        **processor_kwargs,
                    )

                    actual_output = _resolve_completed_output_path(local_output, result)

                    output_content_type = mimetypes.guess_type(str(actual_output))[0] or "application/octet-stream"
                    client.fput_object(config.bucket, next_output_key, str(actual_output), content_type=output_content_type)
                    metrics = result.get("metrics", {}) if isinstance(result, dict) else {}
                    if not isinstance(metrics, dict):
                        metrics = {}
                    if canonical_use_case_id == "crack-detection":
                        crack_events = (
                            result.get("analytics", {}).get("crack_events", [])
                            if isinstance(result.get("analytics"), dict)
                            else []
                        )
                        if not isinstance(crack_events, list):
                            crack_events = []
                        severity_rank = {"low": 1, "medium": 2, "high": 3}
                        dominant_severity = "none"
                        for event in crack_events:
                            event_severity = str((event or {}).get("severity") or "").strip().lower()
                            if severity_rank.get(event_severity, 0) > severity_rank.get(dominant_severity, 0):
                                dominant_severity = event_severity
                        crack_count = int(metrics.get("crack_detections") or 0)
                        metrics.setdefault("crack_detected", crack_count > 0)
                        metrics.setdefault("severity", dominant_severity)
                        metrics.setdefault("status", "cracks_detected" if crack_count > 0 else "clear")
                    if canonical_use_case_id == "unsafe-behavior-detection":
                        unsafe_events = (
                            result.get("analytics", {}).get("unsafe_events", [])
                            if isinstance(result.get("analytics"), dict)
                            else []
                        )
                        if not isinstance(unsafe_events, list):
                            unsafe_events = []
                        severity_rank = {"low": 1, "medium": 2, "high": 3}
                        dominant_severity = "none"
                        for event in unsafe_events:
                            event_severity = str((event or {}).get("severity") or "").strip().lower()
                            if severity_rank.get(event_severity, 0) > severity_rank.get(dominant_severity, 0):
                                dominant_severity = event_severity
                        metrics.setdefault("severity", dominant_severity)
                        metrics.setdefault(
                            "status",
                            "unsafe_detected" if int(metrics.get("total_unsafe_events") or 0) > 0 else "clear",
                        )
                        metrics.setdefault("unsafe_events_preview", unsafe_events[:10])
                    metrics.setdefault("model_mode_used", model_resolution["model_mode_used"])
                    metrics.setdefault("model_path_used", model_resolution["display_model_path"])
                    metrics.setdefault("fallback_used", bool(model_resolution["fallback_used"]))
                    metrics.setdefault("fallback_reason", model_resolution["fallback_reason"])
                    processing_version = _get_integration_processing_version(canonical_use_case_id)
                    if processing_version > 0:
                        metrics.setdefault("processing_version", processing_version)
                    analytics_rows = _persist_use_case_analytics(
                        use_case_id=canonical_use_case_id,
                        result=result,
                        filename=Path(input_key).name,
                        integration_run_id=int(run["id"]),
                        input_bucket=config.bucket,
                        input_object_key=input_key,
                        output_object_key=next_output_key,
                        run_status="completed",
                    )
                    if analytics_rows is not None:
                        metrics.setdefault("analytics_input_id", analytics_rows["input_row"]["input_id"])
                        metrics.setdefault("analytics_output_rows", len(analytics_rows["output_rows"]))
                    update_integration_run(
                        int(run["id"]),
                        status="completed",
                        output_key=next_output_key,
                        message=f"{use_case_title} video processed and uploaded to the MinIO output prefix.",
                        metrics=metrics,
                    )
            except Exception as error:
                failure_message = str(error)
                if (
                    canonical_use_case_id == "crack-detection"
                    and "Crack detection model not found at models/crack_detection/best.pt" in failure_message
                ):
                    failure_message = (
                        "Crack detection model is not installed yet. "
                        "Place best.pt under BackEnd/models/crack_detection/best.pt."
                    )
                if (
                    canonical_use_case_id == "unsafe-behavior-detection"
                    and "Smoking model not found at models/unsafe_behavior/smoking_best.pt" in failure_message
                ):
                    failure_message = (
                        "Smoking model is not installed yet. "
                        "Place smoking_best.pt under BackEnd/models/unsafe_behavior/."
                    )
                if (
                    canonical_use_case_id == "unsafe-behavior-detection"
                    and "COCO model not found or could not be loaded" in failure_message
                ):
                    failure_message = (
                        "COCO YOLO model could not be loaded. "
                        "Place yolov8n.pt under BackEnd/models/common/ or allow Ultralytics to load yolov8n.pt."
                    )
                update_integration_run(
                    int(run["id"]),
                    status="failed",
                    output_key=next_output_key,
                    message=f"{use_case_title} processing failed: {failure_message}",
                )
    finally:
        with INTEGRATION_STATE_LOCK:
            INTEGRATION_THREADS[canonical_use_case_id] = None


def _start_integration_processing(use_case_id: str) -> None:
    canonical_use_case_id = _normalize_integration_use_case_id(use_case_id)
    _ensure_integration_slot(canonical_use_case_id)
    use_case_title = _get_integration_use_case_title(canonical_use_case_id)

    with INTEGRATION_STATE_LOCK:
        processing_mode = str(INTEGRATION_STATES[canonical_use_case_id].get("processing_mode") or "manual")
        current_thread = INTEGRATION_THREADS.get(canonical_use_case_id)
        if current_thread is not None and current_thread.is_alive():
            INTEGRATION_STATES[canonical_use_case_id]["pending_rescan"] = True
            INTEGRATION_STATES[canonical_use_case_id]["processing"] = True
            return
        INTEGRATION_STATES[canonical_use_case_id]["processing"] = True
        INTEGRATION_STATES[canonical_use_case_id]["pending_rescan"] = False
        INTEGRATION_STATES[canonical_use_case_id]["message"] = (
            f"Auto mode is scanning the MinIO input prefix for {use_case_title} videos."
            if processing_mode == "auto"
            else f"Manual mode is processing queued {use_case_title} videos from the MinIO input prefix."
        )
        INTEGRATION_THREADS[canonical_use_case_id] = threading.Thread(
            target=_process_minio_inputs_worker,
            args=(canonical_use_case_id,),
            daemon=True,
        )
        INTEGRATION_THREADS[canonical_use_case_id].start()


@app.on_event("startup")
def startup_event() -> None:
    init_db()
    for use_case_id in INTEGRATION_SUPPORTED_USE_CASES:
        _ensure_integration_slot(use_case_id)
    sync_static_assets()
    ensure_mock_video()
    load_yolo_model()
    load_fire_smoke_preview_components()
    load_ppe_preview_components()


@app.get("/api/fine-tuning/{usecase_slug}/step-1", tags=["Fine Tuning"])
def get_fine_tuning_step_one(usecase_slug: str) -> dict[str, Any]:
    try:
        return build_step_one_response(usecase_slug)
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Unable to load fine-tuning setup: {error}") from error


def _fine_tuning_error_status(error: ValueError) -> int:
    message = str(error).lower()
    return 404 if "not found" in message else 400


@app.get("/api/fine-tuning/{session_id}/datasets", tags=["Fine Tuning"])
def get_fine_tuning_datasets(session_id: int) -> dict[str, Any]:
    try:
        return list_datasets_for_session(session_id)
    except ValueError as error:
        raise HTTPException(status_code=_fine_tuning_error_status(error), detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Unable to load fine-tuning datasets: {error}") from error


@app.post("/api/fine-tuning/{session_id}/datasets/register", tags=["Fine Tuning"])
def register_fine_tuning_dataset(
    session_id: int,
    payload: FineTuningDatasetRegisterRequest,
) -> dict[str, Any]:
    try:
        return register_dataset_for_session(session_id, payload)
    except ValueError as error:
        raise HTTPException(status_code=_fine_tuning_error_status(error), detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Unable to register fine-tuning dataset: {error}") from error


@app.post("/api/fine-tuning/{session_id}/datasets/select", tags=["Fine Tuning"])
def select_fine_tuning_dataset(
    session_id: int,
    payload: FineTuningDatasetSelectRequest,
) -> dict[str, Any]:
    try:
        return select_dataset_for_session(session_id, payload.dataset_id)
    except ValueError as error:
        raise HTTPException(status_code=_fine_tuning_error_status(error), detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Unable to select fine-tuning dataset: {error}") from error


@app.get("/api/fine-tuning/{session_id}/datasets/{dataset_id}", tags=["Fine Tuning"])
def get_fine_tuning_dataset_detail(session_id: int, dataset_id: int) -> dict[str, Any]:
    try:
        return get_dataset_detail(session_id, dataset_id)
    except ValueError as error:
        raise HTTPException(status_code=_fine_tuning_error_status(error), detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Unable to load fine-tuning dataset detail: {error}") from error


@app.delete("/api/fine-tuning/{session_id}/datasets/{dataset_id}", tags=["Fine Tuning"])
def delete_fine_tuning_dataset(session_id: int, dataset_id: int) -> dict[str, Any]:
    try:
        return delete_dataset_for_session(session_id, dataset_id)
    except ValueError as error:
        raise HTTPException(status_code=_fine_tuning_error_status(error), detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Unable to remove fine-tuning dataset: {error}") from error


@app.get("/api/fine-tuning/{session_id}/labels", tags=["Fine Tuning"])
def get_fine_tuning_label_state(session_id: int) -> dict[str, Any]:
    try:
        return get_label_state(session_id)
    except ValueError as error:
        raise HTTPException(status_code=_fine_tuning_error_status(error), detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Unable to load fine-tuning label state: {error}") from error


@app.post("/api/fine-tuning/{session_id}/labels/status", tags=["Fine Tuning"])
def update_fine_tuning_label_status(
    session_id: int,
    payload: FineTuningLabelStatusRequest,
) -> dict[str, Any]:
    try:
        return update_label_status(session_id, payload)
    except ValueError as error:
        raise HTTPException(status_code=_fine_tuning_error_status(error), detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Unable to update fine-tuning label status: {error}") from error


@app.post("/api/fine-tuning/{session_id}/labels/import", tags=["Fine Tuning"])
async def import_fine_tuning_labels(
    session_id: int,
    file: UploadFile = File(...),
) -> dict[str, Any]:
    try:
        content = await file.read()
        return import_yolo_labels_for_session(
            session_id,
            filename=file.filename or "labels.zip",
            content=content,
        )
    except ValueError as error:
        raise HTTPException(status_code=_fine_tuning_error_status(error), detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Unable to import fine-tuning labels: {error}") from error


@app.get("/api/fine-tuning/{session_id}/labels/workspace", tags=["Fine Tuning"])
def get_fine_tuning_annotation_workspace(
    session_id: int,
    limit: int = Query(default=30, ge=1, le=100),
) -> dict[str, Any]:
    try:
        return get_annotation_workspace(session_id, limit=limit)
    except ValueError as error:
        raise HTTPException(status_code=_fine_tuning_error_status(error), detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Unable to load annotation workspace: {error}") from error


@app.post("/api/fine-tuning/{session_id}/labels/manual", tags=["Fine Tuning"])
def save_fine_tuning_manual_annotations(
    session_id: int,
    payload: FineTuningManualAnnotationRequest,
) -> dict[str, Any]:
    try:
        return save_manual_annotations(session_id, payload)
    except ValueError as error:
        raise HTTPException(status_code=_fine_tuning_error_status(error), detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Unable to save manual annotations: {error}") from error


@app.post("/api/fine-tuning/{session_id}/labels/auto-label", tags=["Fine Tuning"])
def auto_label_fine_tuning_dataset(
    session_id: int,
    payload: FineTuningAutoLabelRequest,
) -> dict[str, Any]:
    try:
        return auto_label_dataset(session_id, payload)
    except ValueError as error:
        raise HTTPException(status_code=_fine_tuning_error_status(error), detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Unable to auto-label fine-tuning dataset: {error}") from error


@app.post("/api/fine-tuning/{session_id}/labels/assist", tags=["Fine Tuning"])
def assist_label_fine_tuning_dataset(
    session_id: int,
    payload: FineTuningAssistLabelRequest,
) -> dict[str, Any]:
    try:
        return assist_label_dataset(session_id, payload)
    except ValueError as error:
        raise HTTPException(status_code=_fine_tuning_error_status(error), detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Unable to assist fine-tuning labels: {error}") from error


@app.post("/api/fine-tuning/{session_id}/labels/train-assist-model", tags=["Fine Tuning"])
def train_fine_tuning_assist_model(session_id: int) -> dict[str, Any]:
    try:
        return train_assist_model(session_id)
    except ValueError as error:
        raise HTTPException(status_code=_fine_tuning_error_status(error), detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Unable to train assist model: {error}") from error


@app.post("/api/fine-tuning/{session_id}/labels/assist-propagate", tags=["Fine Tuning"])
def assist_propagate_fine_tuning_labels(
    session_id: int,
    payload: FineTuningAssistLabelRequest,
) -> dict[str, Any]:
    try:
        return assist_propagate_dataset(session_id, payload)
    except ValueError as error:
        raise HTTPException(status_code=_fine_tuning_error_status(error), detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Unable to propagate assist labels: {error}") from error


@app.post("/api/fine-tuning/{session_id}/labels/sam", tags=["Fine Tuning"])
def segment_fine_tuning_annotation_with_sam(
    session_id: int,
    payload: FineTuningSamAssistRequest,
) -> dict[str, Any]:
    try:
        return segment_with_sam(session_id, payload)
    except ValueError as error:
        raise HTTPException(status_code=_fine_tuning_error_status(error), detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Unable to refine annotation with SAM: {error}") from error


@app.post("/api/fine-tuning/{session_id}/labels/export-yolo", tags=["Fine Tuning"])
def export_fine_tuning_labels_as_yolo(session_id: int) -> dict[str, Any]:
    try:
        return export_selected_dataset_to_yolo(session_id)
    except ValueError as error:
        raise HTTPException(status_code=_fine_tuning_error_status(error), detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Unable to export fine-tuning dataset: {error}") from error


@app.post("/api/fine-tuning/{session_id}/prepare-dataset-ready-payload", tags=["Fine Tuning"])
def prepare_fine_tuning_dataset_ready_payload(session_id: int) -> dict[str, Any]:
    try:
        return build_dataset_ready_payload(session_id)
    except ValueError as error:
        raise HTTPException(status_code=_fine_tuning_error_status(error), detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Unable to prepare fine-tuning dataset handoff: {error}") from error


@app.post("/api/fine-tuning/{session_id}/run-data-check", tags=["Fine Tuning"])
def run_fine_tuning_data_check(session_id: int, background_tasks: BackgroundTasks) -> dict[str, Any]:
    try:
        audit = start_data_check(session_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Unable to start data check: {error}") from error

    background_tasks.add_task(run_dataset_audit, int(audit["id"]))
    return {
        "session_id": session_id,
        "audit_id": int(audit["id"]),
        "status": audit["status"],
    }


@app.get("/api/fine-tuning/{session_id}/data-check-status", tags=["Fine Tuning"])
def get_fine_tuning_data_check_status(session_id: int) -> dict[str, Any]:
    try:
        return get_data_check_status(session_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Unable to load data check status: {error}") from error


@app.post("/api/fine-tuning/{session_id}/start-setup", tags=["Fine Tuning"])
def start_fine_tuning_setup(session_id: int) -> dict[str, Any]:
    try:
        return start_setup(session_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Unable to start fine-tuning setup: {error}") from error


@app.post("/api/fine-tuning/{session_id}/start-new-setup", tags=["Fine Tuning"])
def start_fine_tuning_new_setup(session_id: int) -> dict[str, Any]:
    try:
        return start_new_setup(session_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Unable to start a new fine-tuning setup: {error}") from error


def image_to_base64(image: np.ndarray) -> str:
    success, buffer = cv2.imencode(".jpg", image)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to encode annotated image.")
    encoded = base64.b64encode(buffer.tobytes()).decode("utf-8")
    return f"data:image/jpeg;base64,{encoded}"


def extract_preview_frame(video_path: Path) -> np.ndarray:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise HTTPException(status_code=400, detail="Uploaded file is not a readable video.")

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if total_frames > 10:
        cap.set(cv2.CAP_PROP_POS_FRAMES, total_frames // 3)

    ok, frame = cap.read()
    cap.release()

    if not ok or frame is None:
        raise HTTPException(status_code=400, detail="Unable to extract a preview frame from the uploaded video.")

    return frame


def run_yolo_inference(image: np.ndarray) -> tuple[np.ndarray, list[dict[str, str | float]]]:
    if YOLO_MODEL is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "YOLO model is not available. Place best.pt or yolov8n.pt in the BackEnd folder "
                "or enable internet access for the initial model download."
            ),
        )

    results = YOLO_MODEL(image)
    annotated = results[0].plot()
    names: dict[int, Any] = results[0].names
    detections: list[dict[str, str | float]] = []

    for box in results[0].boxes:
        class_id = int(box.cls[0])
        confidence = float(box.conf[0])
        detections.append(
            {
                "class": str(names.get(class_id, class_id)),
                "confidence": round(confidence, 4),
            }
        )

    return annotated, detections


def _normalize_fire_detection_mode(value: str | None) -> str:
    normalized = str(value or "both").strip().lower()
    if normalized in {"fire", "fire_only"}:
        return "fire"
    if normalized in {"smoke", "smoke_only"}:
        return "smoke"
    return "both"


def _parse_preview_roi(roi_json: str | None) -> dict[str, float] | None:
    if not roi_json:
        return None
    try:
        payload = json.loads(roi_json)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="ROI payload is not valid JSON.")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="ROI payload must be an object.")

    try:
        x = max(0.0, min(1.0, float(payload.get("x", 0.0))))
        y = max(0.0, min(1.0, float(payload.get("y", 0.0))))
        width = max(0.0, min(1.0, float(payload.get("width", 0.0))))
        height = max(0.0, min(1.0, float(payload.get("height", 0.0))))
    except (TypeError, ValueError) as error:
        raise HTTPException(status_code=400, detail="ROI coordinates must be numeric.") from error

    if width <= 0.0 or height <= 0.0:
        return None

    width = min(width, 1.0 - x)
    height = min(height, 1.0 - y)
    if width <= 0.0 or height <= 0.0:
        return None

    return {
        "x": x,
        "y": y,
        "width": width,
        "height": height,
    }


def _normalize_zone_points_normalized(points: Any) -> list[list[float]] | None:
    if points is None:
        return None
    if not isinstance(points, (list, tuple)):
        raise HTTPException(status_code=400, detail="zone_points_normalized must be a list of [x, y] points.")

    normalized_points: list[list[float]] = []
    for point in points:
        if not isinstance(point, (list, tuple)) or len(point) != 2:
            raise HTTPException(status_code=400, detail="Each ROI point must contain two normalized coordinates.")
        try:
            x = max(0.0, min(1.0, float(point[0])))
            y = max(0.0, min(1.0, float(point[1])))
        except (TypeError, ValueError) as error:
            raise HTTPException(status_code=400, detail="ROI point coordinates must be numeric.") from error
        normalized_points.append([x, y])

    if len(normalized_points) < 4:
        raise HTTPException(status_code=400, detail="Region Alerts ROI requires at least four normalized points.")
    return normalized_points


def _normalize_region_alert_rule_config(rule_config: Any) -> dict[str, Any] | None:
    if rule_config is None:
        return None
    if not isinstance(rule_config, dict):
        raise HTTPException(status_code=400, detail="rule_config must be an object.")

    trigger_type = str(rule_config.get("trigger_type") or "enter").strip().lower()
    if trigger_type not in {"enter", "exit"}:
        trigger_type = "enter"

    try:
        alert_delay_sec = float(rule_config.get("alert_delay_sec", 0))
    except (TypeError, ValueError) as error:
        raise HTTPException(status_code=400, detail="alert_delay_sec must be numeric.") from error
    alert_delay_sec = max(0.0, min(10.0, alert_delay_sec))

    try:
        confidence_threshold = float(rule_config.get("confidence_threshold", 0.5))
    except (TypeError, ValueError) as error:
        raise HTTPException(status_code=400, detail="confidence_threshold must be numeric.") from error
    confidence_threshold = max(0.1, min(1.0, confidence_threshold))

    alerts_enabled_value = rule_config.get("alerts_enabled", True)
    if isinstance(alerts_enabled_value, str):
        alerts_enabled = alerts_enabled_value.strip().lower() not in {"false", "0", "off", "no"}
    else:
        alerts_enabled = bool(alerts_enabled_value)

    return {
        "trigger_type": trigger_type,
        "alert_delay_sec": round(alert_delay_sec, 2),
        "confidence_threshold": round(confidence_threshold, 2),
        "alerts_enabled": alerts_enabled,
    }


def _roi_polygon_from_normalized(roi: dict[str, float], frame_width: int, frame_height: int) -> np.ndarray:
    x1 = int(round(roi["x"] * frame_width))
    y1 = int(round(roi["y"] * frame_height))
    x2 = int(round((roi["x"] + roi["width"]) * frame_width))
    y2 = int(round((roi["y"] + roi["height"]) * frame_height))
    x1 = max(0, min(frame_width - 1, x1))
    y1 = max(0, min(frame_height - 1, y1))
    x2 = max(x1 + 1, min(frame_width, x2))
    y2 = max(y1 + 1, min(frame_height, y2))
    return np.array(
        [
            [x1, y1],
            [x2, y1],
            [x2, y2],
            [x1, y2],
        ],
        dtype=np.int32,
    )


def _roi_points_normalized(roi: dict[str, float]) -> list[list[float]]:
    return [
        [roi["x"], roi["y"]],
        [roi["x"] + roi["width"], roi["y"]],
        [roi["x"] + roi["width"], roi["y"] + roi["height"]],
        [roi["x"], roi["y"] + roi["height"]],
    ]


def _apply_roi_overlay(image: np.ndarray, polygon: np.ndarray, label: str) -> None:
    mask = np.zeros(image.shape[:2], dtype=np.uint8)
    cv2.fillPoly(mask, [polygon], 255)
    dimmed = (image.astype(np.float32) * 0.35).astype(np.uint8)
    image[mask == 0] = dimmed[mask == 0]
    cv2.polylines(image, [polygon], True, (0, 140, 255), 2, cv2.LINE_AA)
    cv2.putText(
        image,
        label,
        (int(polygon[0][0]) + 10, max(20, int(polygon[0][1]) + 24)),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.55,
        (0, 140, 255),
        2,
        cv2.LINE_AA,
    )


def _bbox_center_inside_polygon(bbox: list[int], polygon: np.ndarray) -> bool:
    x1, y1, x2, y2 = bbox
    cx = int(round((x1 + x2) / 2))
    cy = int(round((y1 + y2) / 2))
    return point_in_polygon(cx, cy, polygon)


def _normalize_ppe_detection_mode(value: Any) -> str:
    normalized = str(value or "helmet_vest").strip().lower()
    return normalized if normalized in {"helmet", "vest", "helmet_vest"} else "helmet_vest"


def _normalize_speed_detection_class(value: Any) -> str:
    normalized = str(value or "all").strip().lower()
    aliases = {
        "motorbike": "motorcycle",
        "bike": "bicycle",
        "cycle": "bicycle",
    }
    normalized = aliases.get(normalized, normalized)
    return normalized if normalized in {"all", "car", "bus", "truck", "motorcycle", "bicycle"} else "all"


def _format_ppe_preview_value(value: Any) -> str:
    return "Present" if bool(value) else "Missing"


def _build_ppe_preview_label(status: dict[str, Any], detection_mode: str) -> tuple[str, tuple[int, int, int]]:
    if detection_mode == "helmet":
        helmet_present = bool(status.get("helmet"))
        return f"Helmet: {'Present' if helmet_present else 'Missing'}", ((46, 204, 113) if helmet_present else (52, 73, 235))
    if detection_mode == "vest":
        vest_present = bool(status.get("vest"))
        return f"Vest: {'Present' if vest_present else 'Missing'}", ((46, 204, 113) if vest_present else (52, 73, 235))

    helmet_present = bool(status.get("helmet"))
    vest_present = bool(status.get("vest"))
    color = (46, 204, 113) if helmet_present and vest_present else (52, 73, 235)
    return (
        f"Helmet: {'Present' if helmet_present else 'Missing'} | Vest: {'Present' if vest_present else 'Missing'}",
        color,
    )


def _normalize_speed_object_type(value: Any) -> str:
    normalized = str(value or "").strip().lower()
    aliases = {
        "motorbike": "motorcycle",
        "bike": "bicycle",
        "cycle": "bicycle",
    }
    return aliases.get(normalized, normalized)


def _speed_summary_matches_class(summary: dict[str, Any], speed_detection_class: str) -> bool:
    if speed_detection_class == "all":
        return True
    return _normalize_speed_object_type(summary.get("object_type")) == speed_detection_class


def _build_speed_preview_detections(
    result: dict[str, Any],
    speed_detection_class: str,
) -> list[dict[str, str | float | int | bool]]:
    metrics = result.get("metrics", {}) if isinstance(result, dict) else {}
    analytics = result.get("analytics", {}) if isinstance(result, dict) else {}
    raw_summaries = analytics.get("speed_summaries", []) if isinstance(analytics, dict) and isinstance(analytics.get("speed_summaries"), list) else []
    matched_summaries = [summary for summary in raw_summaries if isinstance(summary, dict) and _speed_summary_matches_class(summary, speed_detection_class)]

    if speed_detection_class == "all":
        return [
            {"class": "vehicles scanned", "confidence": float(metrics.get("total_vehicles", 0))},
            {"class": "avg speed km/h", "confidence": float(metrics.get("avg_speed_kmh", 0))},
            {"class": "max speed km/h", "confidence": float(metrics.get("max_speed_kmh", 0))},
            {"class": "speeding violations", "confidence": float(metrics.get("speeding_violations", 0))},
        ]

    speeds = [float(summary.get("detected_speed_kmh") or 0) for summary in matched_summaries]
    violations = [summary for summary in matched_summaries if bool(summary.get("is_overspeeding"))]
    detections: list[dict[str, str | float | int | bool]] = [
        {"class": "vehicles scanned", "confidence": float(len(matched_summaries))},
        {"class": "avg speed km/h", "confidence": round(sum(speeds) / len(speeds), 1) if speeds else 0.0},
        {"class": "max speed km/h", "confidence": round(max(speeds), 1) if speeds else 0.0},
        {"class": "speeding violations", "confidence": float(len(violations))},
    ]

    for summary in matched_summaries:
        object_type = _normalize_speed_object_type(summary.get("object_type")) or speed_detection_class
        object_id = summary.get("object_id")
        detections.append(
            {
                "class": f"{object_type.title()} #{object_id}" if object_id is not None else object_type.title(),
                "confidence": float(summary.get("confidence_score") or 0),
                "object_type": object_type,
                "detected_speed_kmh": round(float(summary.get("detected_speed_kmh") or 0), 1),
                "speed_limit_kmh": round(float(summary.get("speed_limit_kmh") or 0), 1),
                "status": str(summary.get("status") or ("overspeed" if summary.get("is_overspeeding") else "normal")).replace("_", " "),
                "is_overspeeding": bool(summary.get("is_overspeeding")),
            }
        )

    return detections


def run_ppe_preview(
    frame: np.ndarray,
    *,
    detection_mode: str = "helmet_vest",
) -> tuple[np.ndarray, list[dict[str, str | float]]]:
    if PPE_PREVIEW_PERSON_MODEL is None or PPE_PREVIEW_DETECTOR is None:
        raise HTTPException(
            status_code=503,
            detail="PPE preview model is not available. Add yolov8n.pt/best.pt and BackEnd/models/ppe/best.pt in BackEnd.",
        )

    annotated = frame.copy()
    fh, fw = frame.shape[:2]
    normalized_mode = _normalize_ppe_detection_mode(detection_mode)

    try:
        results = PPE_PREVIEW_PERSON_MODEL.track(
            source=frame,
            classes=[0],
            conf=0.40,
            iou=0.70,
            device=auto_device(),
            persist=False,
            verbose=False,
        )
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"PPE preview failed: {error}") from error

    boxes = []
    tids = []
    detections: list[dict[str, str | float]] = []

    if results and results[0].boxes is not None:
        det = results[0].boxes
        if det.xyxy is not None and len(det.xyxy) > 0:
            boxes = det.xyxy.cpu().numpy()
            tids = det.id.cpu().numpy().astype(int).tolist() if det.id is not None else list(range(len(boxes)))

    vis_list = [ppe_engine.check_vis(box, fh, fw) for box in boxes]
    ppe_list = PPE_PREVIEW_DETECTOR.evaluate_frame(frame, boxes, vis_list)

    for index, bbox in enumerate(boxes):
        if index >= len(vis_list) or not vis_list[index]["ok"]:
            continue
        tid = tids[index] if index < len(tids) else index
        status = ppe_list[index]
        x1, y1, x2, y2 = map(int, bbox.tolist())
        label, color = _build_ppe_preview_label(status, normalized_mode)
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        cv2.putText(annotated, label, (x1, max(20, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2, cv2.LINE_AA)

        detection: dict[str, str | float | list[int]] = {
            "class": f"person #{tid}",
            "confidence": 1.0,
            "bbox": [x1, y1, x2, y2],
        }
        if normalized_mode in {"helmet", "helmet_vest"}:
            detection["helmet"] = _format_ppe_preview_value(status.get("helmet"))
        if normalized_mode in {"vest", "helmet_vest"}:
            detection["vest"] = _format_ppe_preview_value(status.get("vest"))
        detections.append(detection)

    return annotated, detections


def run_region_alerts_preview(frame: np.ndarray, roi: dict[str, float] | None = None) -> tuple[np.ndarray, list[dict[str, str | float]]]:
    annotated = frame.copy()
    fh, fw = annotated.shape[:2]
    zone = _roi_polygon_from_normalized(roi, fw, fh) if roi else create_default_zone(fw, fh)

    overlay = annotated.copy()
    cv2.fillPoly(overlay, [zone], (0, 0, 80))
    cv2.addWeighted(overlay, 0.25, annotated, 0.75, 0, annotated)
    cv2.polylines(annotated, [zone], True, (0, 50, 230), 2, cv2.LINE_AA)
    cv2.putText(
        annotated,
        "SELECTED ROI" if roi else "RESTRICTED ZONE",
        (zone[0][0] + 10, zone[0][1] + 25),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.55,
        (0, 50, 230),
        2,
        cv2.LINE_AA,
    )

    if YOLO_MODEL is None:
        raise HTTPException(status_code=503, detail="YOLO model is not available for region alerts preview.")

    results = YOLO_MODEL(frame, classes=[PERSON_CLASS], conf=0.25, verbose=False)
    detections: list[dict[str, str | float]] = []
    names: dict[int, Any] = results[0].names if results else {}

    if results and results[0].boxes is not None:
        for box in results[0].boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            conf = float(box.conf[0])
            cls_id = int(box.cls[0])
            cx = (x1 + x2) // 2
            foot_y = y2
            in_zone = point_in_polygon(cx, foot_y, zone)
            color = (0, 50, 230) if in_zone else (0, 200, 0)
            base_label = str(names.get(cls_id, cls_id))
            label = f"{base_label} alert" if in_zone else base_label
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
            cv2.putText(annotated, label, (x1, max(20, y1 - 8)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2, cv2.LINE_AA)
            detections.append({
                "class": label.lower(),
                "confidence": round(conf, 4),
                "zone_status": "inside" if in_zone else "outside",
            })

    return annotated, detections


def run_region_alerts_video_preview(
    video_path: Path,
    source_name: str | None = None,
    roi: dict[str, float] | None = None,
) -> dict[str, Any]:
    processor = get_processor("region-alerts")
    if processor is None:
        raise HTTPException(status_code=500, detail="Region Alerts processor is not available.")

    source_stem = Path(source_name or video_path.name).stem or f"region_preview_{uuid4().hex[:8]}"
    safe_stem = "".join(char if char.isalnum() or char in {"-", "_"} else "_" for char in source_stem).strip("_") or "region_preview"
    output_path = PROCESSED_DIR / f"{safe_stem}_region_alerts_preview.mp4"

    result = processor(
        input_path=str(video_path),
        output_path=str(output_path),
        model_path=resolve_default_model_path(),
        device=auto_device(),
        show=False,
        zone_points_normalized=_roi_points_normalized(roi) if roi else None,
    )
    actual_output = _resolve_completed_output_path(output_path, result)
    preview_frame = extract_preview_frame(actual_output)

    analytics = result.get("analytics", {}) if isinstance(result, dict) else {}
    intrusion_summaries = analytics.get("intrusion_summaries", []) if isinstance(analytics.get("intrusion_summaries"), list) else []
    detections = [
        {
            "class": str(event.get("alert_type", "zone_intrusion")).replace("_", " "),
            "confidence": round(float(event.get("confidence_score") or 0), 4),
            "severity": str(event.get("severity", "low")),
            "zone_status": "inside",
            "tracked_object_id": str((event.get("metadata") or {}).get("tracked_object_id", "")),
        }
        for event in intrusion_summaries
    ]

    return {
        "preview_image_base64": image_to_base64(preview_frame),
        "detections": detections,
        "output_video_url": f"/static/processed/{actual_output.name}",
    }


def run_fire_detection_preview(
    frame: np.ndarray,
    *,
    detection_mode: str = "both",
    roi: dict[str, float] | None = None,
) -> tuple[np.ndarray, list[dict[str, str | float]]]:
    normalized_mode = _normalize_fire_detection_mode(detection_mode)
    include_fire = normalized_mode in {"fire", "both"}
    include_smoke = normalized_mode in {"smoke", "both"}
    detections: list[dict[str, str | float]] = []

    if FIRE_SMOKE_PREVIEW_MODEL is not None:
        try:
            results = FIRE_SMOKE_PREVIEW_MODEL.predict(
                source=frame,
                conf=0.40,
                verbose=False,
                imgsz=640,
            )
            annotated = results[0].plot() if results else frame.copy()
            names: dict[int, Any] = results[0].names if results else {}
            if results and results[0].boxes is not None:
                for box in results[0].boxes:
                    confidence = float(box.conf[0]) if box.conf is not None else 0.0
                    class_id = int(box.cls[0]) if box.cls is not None else -1
                    class_name = str(names.get(class_id, class_id)).lower()
                    if "smoke" in class_name and not include_smoke:
                        continue
                    if ("fire" in class_name or "flame" in class_name) and not include_fire:
                        continue
                    detections.append(
                        {
                            "class": class_name,
                            "confidence": round(confidence, 4),
                        }
                    )
            return annotated, detections
        except Exception:
            pass

    annotated = frame.copy()
    fh, fw = annotated.shape[:2]
    roi_polygon = _roi_polygon_from_normalized(roi, fw, fh) if roi else None
    if roi_polygon is not None:
        _apply_roi_overlay(annotated, roi_polygon, "ROI FILTER")

    fire_regions, smoke_regions = detect_fire_smoke_hsv(frame)

    for region in fire_regions if include_fire else []:
        x1, y1, x2, y2 = region["bbox"]
        confidence = float(region["confidence"])
        if roi_polygon is not None and not _bbox_center_inside_polygon([x1, y1, x2, y2], roi_polygon):
            continue
        cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 0, 255), 2)
        cv2.putText(annotated, f"FIRE {confidence:.0%}", (x1, max(20, y1 - 8)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2, cv2.LINE_AA)
        detections.append({
            "class": "fire",
            "confidence": round(confidence, 4),
        })

    for region in smoke_regions if include_smoke else []:
        x1, y1, x2, y2 = region["bbox"]
        confidence = float(region["confidence"])
        if roi_polygon is not None and not _bbox_center_inside_polygon([x1, y1, x2, y2], roi_polygon):
            continue
        cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 140, 255), 2)
        cv2.putText(annotated, f"SMOKE {confidence:.0%}", (x1, max(20, y1 - 8)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 140, 255), 2, cv2.LINE_AA)
        detections.append({
            "class": "smoke",
            "confidence": round(confidence, 4),
        })

    return annotated, detections


def run_speed_estimation_preview(
    video_path: Path,
    *,
    speed_detection_class: str = "all",
) -> tuple[np.ndarray, list[dict[str, str | float]]]:
    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as temp_output:
        output_path = Path(temp_output.name)

    model_path = str(BEST_MODEL_PATH) if BEST_MODEL_PATH.exists() else str(LOCAL_FALLBACK_MODEL_PATH)
    normalized_speed_class = _normalize_speed_detection_class(speed_detection_class)

    try:
        result = speed_process_video(
            input_path=str(video_path),
            output_path=str(output_path),
            model_path=model_path,
            device=auto_device(),
            show=False,
        )
        preview_frame = extract_preview_frame(output_path)
        detections = _build_speed_preview_detections(result if isinstance(result, dict) else {}, normalized_speed_class)
        return preview_frame, detections
    finally:
        output_path.unlink(missing_ok=True)


def run_crack_detection_preview(
    *,
    frame: np.ndarray | None = None,
    video_path: Path | None = None,
) -> tuple[np.ndarray, list[dict[str, Any]], dict[str, Any]]:
    if frame is not None:
        result = crack_process_image(
            frame=frame,
            model_path="models/crack_detection/best.pt",
            device=auto_device(),
            conf=0.35,
        )
        return (
            result["annotated_image"],
            result.get("detections", []),
            result.get("metrics", {}),
        )

    if video_path is None:
        raise HTTPException(status_code=400, detail="Crack detection preview requires an image or video input.")

    processor = get_processor("crack-detection")
    if processor is None:
        raise HTTPException(status_code=500, detail="Crack detection processor is not available.")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as temp_output:
        output_path = Path(temp_output.name)

    try:
        result = processor(
            input_path=str(video_path),
            output_path=str(output_path),
            model_path="models/crack_detection/best.pt",
            device=auto_device(),
            show=False,
            conf=0.35,
        )
        preview_frame = extract_preview_frame(output_path)
        analytics = result.get("analytics", {}) if isinstance(result, dict) else {}
        crack_events = analytics.get("crack_events", []) if isinstance(analytics.get("crack_events"), list) else []
        detections = [
            {
                "class": str(event.get("class_name", "crack")).lower(),
                "confidence": round(float(event.get("confidence_score") or 0), 4),
                "severity": str(event.get("severity") or "low"),
            }
            for event in crack_events[:20]
        ]
        return preview_frame, detections, result.get("metrics", {})
    finally:
        output_path.unlink(missing_ok=True)


def run_unsafe_behavior_preview(
    *,
    frame: np.ndarray | None = None,
    video_path: Path | None = None,
) -> tuple[np.ndarray, list[dict[str, Any]], dict[str, Any]]:
    if frame is not None:
        result = unsafe_behavior_process_image(
            frame=frame,
            model_path="models/unsafe_behavior/smoking_best.pt",
            device=auto_device(),
            conf=0.35,
        )
        return (
            result["annotated_image"],
            result.get("detections", []),
            result.get("metrics", {}),
        )

    if video_path is None:
        raise HTTPException(status_code=400, detail="Unsafe behavior preview requires an image or video input.")

    processor = get_processor("unsafe-behavior-detection")
    if processor is None:
        raise HTTPException(status_code=500, detail="Unsafe behavior processor is not available.")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as temp_output:
        output_path = Path(temp_output.name)

    try:
        result = processor(
            input_path=str(video_path),
            output_path=str(output_path),
            model_path="models/unsafe_behavior/smoking_best.pt",
            device=auto_device(),
            show=False,
            conf=0.35,
        )
        preview_frame = extract_preview_frame(output_path)
        analytics = result.get("analytics", {}) if isinstance(result, dict) else {}
        unsafe_events = analytics.get("unsafe_events", []) if isinstance(analytics.get("unsafe_events"), list) else []
        detections = [
            {
                "class": str(event.get("event_type", "unsafe")).lower(),
                "confidence": round(float(event.get("confidence") or 0), 4),
                "severity": str(event.get("severity") or "low"),
            }
            for event in unsafe_events[:20]
        ]
        return preview_frame, detections, result.get("metrics", {})
    finally:
        output_path.unlink(missing_ok=True)


def run_classwise_counting_preview(frame: np.ndarray) -> tuple[np.ndarray, list[dict[str, str | float]]]:
    if YOLO_MODEL is None:
        raise HTTPException(status_code=503, detail="YOLO model is not available for class-wise counting preview.")

    annotated = frame.copy()
    results = YOLO_MODEL(frame, classes=[2, 3, 5, 7], conf=0.25, verbose=False)
    detections: list[dict[str, str | float]] = []
    class_counts = {"car": 0, "motorcycle": 0, "bus": 0, "truck": 0}
    names: dict[int, Any] = results[0].names if results else {}

    if results and results[0].boxes is not None:
        for index, box in enumerate(results[0].boxes, start=1):
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            conf = float(box.conf[0])
            cls_id = int(box.cls[0])
            cls_name = str(names.get(cls_id, cls_id)).lower()
            class_counts[cls_name] = class_counts.get(cls_name, 0) + 1
            cv2.rectangle(annotated, (x1, y1), (x2, y2), (39, 35, 92), 2)
            cv2.putText(annotated, f"{cls_name.title()} #{index}", (x1, max(20, y1 - 8)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (39, 35, 92), 2, cv2.LINE_AA)
            detections.append({"class": cls_name, "confidence": round(conf, 4)})

    y = 28
    for label in ["car", "truck", "bus", "motorcycle"]:
        cv2.putText(annotated, f"{label.title()}: {class_counts.get(label, 0)}", (16, y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (39, 35, 92), 2, cv2.LINE_AA)
        y += 24

    return annotated, detections


def run_object_counting_preview(frame: np.ndarray) -> tuple[np.ndarray, list[dict[str, str | float]]]:
    if YOLO_MODEL is None:
        raise HTTPException(status_code=503, detail="YOLO model is not available for object counting preview.")

    annotated = frame.copy()
    results = YOLO_MODEL(frame, conf=0.20, verbose=False)
    detections: list[dict[str, str | float]] = []
    count = 0
    names: dict[int, Any] = results[0].names if results else {}

    if results and results[0].boxes is not None:
        for box in results[0].boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            conf = float(box.conf[0])
            cls_id = int(box.cls[0]) if box.cls is not None else -1
            cls_name = str(names.get(cls_id, cls_id))
            count += 1
            cv2.rectangle(annotated, (x1, y1), (x2, y2), (39, 35, 92), 2)
            cv2.putText(annotated, f"{cls_name} #{count}", (x1, max(20, y1 - 8)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (39, 35, 92), 2, cv2.LINE_AA)
            detections.append(
                {
                    "class": cls_name.lower(),
                    "confidence": round(conf, 4),
                    "bbox": [x1, y1, x2, y2],
                }
            )

    cv2.putText(annotated, f"Counted Objects: {count}", (16, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.75, (222, 27, 84), 2, cv2.LINE_AA)
    return annotated, detections


def detect_file_kind(upload: UploadFile) -> str:
    content_type = (upload.content_type or "").lower()
    suffix = Path(upload.filename or "").suffix.lower()

    if content_type.startswith("image/") or suffix in {".jpg", ".jpeg", ".png", ".bmp", ".webp"}:
        return "image"
    if content_type.startswith("video/") or suffix in ALLOWED_VIDEO_EXTENSIONS:
        return "video"
    raise HTTPException(status_code=400, detail="Unsupported file type. Upload an image or video.")


def detect_path_kind(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in {".jpg", ".jpeg", ".png", ".bmp", ".webp"}:
        return "image"
    if suffix in ALLOWED_VIDEO_EXTENSIONS:
        return "video"
    raise HTTPException(status_code=400, detail="Unsupported sample file type.")


def build_playground_preview_response(
    *,
    use_case_id: str,
    meta: dict[str, Any],
    file_kind: str,
    frame: np.ndarray,
    temp_path: Path | None = None,
    cleanup_temp_path: bool = True,
    source_name: str | None = None,
    preview_options: dict[str, Any] | None = None,
) -> dict[str, object]:
    preview_options = preview_options or {}
    roi = preview_options.get("roi")
    fire_detection_mode = _normalize_fire_detection_mode(preview_options.get("fire_detection_mode"))
    ppe_detection_mode = _normalize_ppe_detection_mode(preview_options.get("ppe_detection_mode"))
    speed_detection_class = _normalize_speed_detection_class(preview_options.get("speed_detection_class"))
    try:
        if use_case_id == "ppe-detection":
            annotated_image, detections = run_ppe_preview(frame, detection_mode=ppe_detection_mode)
            model_source = PPE_PREVIEW_MODEL_SOURCE
        elif use_case_id == "object-counting":
            annotated_image, detections = run_object_counting_preview(frame)
            model_source = YOLO_MODEL_SOURCE
        elif use_case_id == "class-wise-object-counting":
            annotated_image, detections = run_classwise_counting_preview(frame)
            model_source = YOLO_MODEL_SOURCE
        elif use_case_id == "region-alerts":
            if file_kind == "video" and temp_path is not None:
                region_video_preview = run_region_alerts_video_preview(temp_path, source_name=source_name, roi=roi)
                annotated_image = None
                detections = region_video_preview["detections"]
                model_source = "use_cases.zone_intrusion"
            else:
                annotated_image, detections = run_region_alerts_preview(frame, roi=roi)
                region_video_preview = None
                model_source = YOLO_MODEL_SOURCE
        elif use_case_id == "fire-detection":
            annotated_image, detections = run_fire_detection_preview(frame, detection_mode=fire_detection_mode, roi=roi)
            model_source = FIRE_SMOKE_PREVIEW_MODEL_SOURCE or "fire-smoke-hsv-preview"
        elif use_case_id == "speed-estimation":
            if file_kind != "video" or temp_path is None:
                raise HTTPException(
                    status_code=400,
                    detail="Speed Estimation playground preview requires a video upload.",
                )
            annotated_image, detections = run_speed_estimation_preview(temp_path, speed_detection_class=speed_detection_class)
            model_source = "use_cases.speed_estimation"
        elif use_case_id == "crack-detection":
            if file_kind == "video":
                if temp_path is None:
                    raise HTTPException(status_code=400, detail="Crack detection playground preview requires a valid uploaded video.")
                annotated_image, detections, crack_metrics = run_crack_detection_preview(video_path=temp_path)
            else:
                annotated_image, detections, crack_metrics = run_crack_detection_preview(frame=frame)
            model_source = "use_cases.crack_detection"
        elif use_case_id == "unsafe-behavior-detection":
            if file_kind == "video":
                if temp_path is None:
                    raise HTTPException(status_code=400, detail="Unsafe behavior playground preview requires a valid uploaded video.")
                annotated_image, detections, unsafe_metrics = run_unsafe_behavior_preview(video_path=temp_path)
            else:
                annotated_image, detections, unsafe_metrics = run_unsafe_behavior_preview(frame=frame)
            model_source = "use_cases.unsafe_behavior_detection"
        else:
            annotated_image, detections = run_yolo_inference(frame)
            model_source = YOLO_MODEL_SOURCE
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    finally:
        if cleanup_temp_path and temp_path is not None:
            temp_path.unlink(missing_ok=True)

    response = {
        "status": "success",
        "use_case_id": use_case_id,
        "use_case_title": meta["title"],
        "file_kind": file_kind,
        "detections": detections,
        "model_source": model_source,
        "preview_options": {
            "fire_detection_mode": fire_detection_mode,
            "ppe_detection_mode": ppe_detection_mode,
            "speed_detection_class": speed_detection_class,
            "roi_applied": bool(roi),
        },
    }
    if use_case_id == "crack-detection":
        response["metrics"] = crack_metrics
    if use_case_id == "unsafe-behavior-detection":
        response["metrics"] = unsafe_metrics
    if use_case_id == "region-alerts" and file_kind == "video" and temp_path is not None and region_video_preview is not None:
        response["image_base64"] = region_video_preview["preview_image_base64"]
        response["output_video_url"] = region_video_preview["output_video_url"]
    else:
        response["image_base64"] = image_to_base64(annotated_image)
    return response


def _parse_json_blob(raw_value: Any) -> dict[str, Any]:
    if not raw_value:
        return {}
    if isinstance(raw_value, dict):
        return raw_value
    if isinstance(raw_value, str):
        try:
            parsed = json.loads(raw_value)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _serialize_region_demo_timestamp(day_offset: int, hour: int, minute: int, second: int = 0) -> str:
    base = datetime.now(timezone.utc) - timedelta(days=day_offset)
    stamped = base.replace(hour=hour, minute=minute, second=second, microsecond=0)
    return stamped.isoformat()


def _count_region_records_by_origin() -> tuple[int, int]:
    query = """
        SELECT
            SUM(
                CASE
                    WHEN i.source_ref LIKE ? OR json_extract(i.metadata_json, '$.synthetic_demo') = 1 THEN 1
                    ELSE 0
                END
            ) AS synthetic_count,
            SUM(
                CASE
                    WHEN i.source_ref LIKE ? OR json_extract(i.metadata_json, '$.synthetic_demo') = 1 THEN 0
                    ELSE 1
                END
            ) AS real_count
        FROM region_alert_outputs o
        JOIN region_alert_inputs i ON i.input_id = o.input_id
    """
    with get_connection() as connection:
        row = connection.execute(
            query,
            (f"{REGION_SYNTHETIC_SOURCE_PREFIX}:%", f"{REGION_SYNTHETIC_SOURCE_PREFIX}:%"),
        ).fetchone()

    synthetic_count = int(row["synthetic_count"] or 0) if row else 0
    real_count = int(row["real_count"] or 0) if row else 0
    return synthetic_count, real_count


def _next_region_synthetic_seed_index() -> int:
    query = """
        SELECT COUNT(*) AS total
        FROM region_alert_inputs
        WHERE source_ref LIKE ?
    """
    with get_connection() as connection:
        row = connection.execute(query, (f"{REGION_SYNTHETIC_SOURCE_PREFIX}:%",)).fetchone()
    return int(row["total"] or 0) if row else 0


def _build_region_synthetic_input(seed_index: int) -> dict[str, Any]:
    rng = random.Random(20260417 + seed_index)
    scenario_catalog = [
        {
            "location": "Warehouse A",
            "zone": "Forklift Bay",
            "zone_type": "hazardous",
            "cameras": ["CAM-03", "CAM-04"],
            "shift_weights": [("Swing Shift", 0.45), ("Night Shift", 0.35), ("Morning Shift", 0.20)],
            "alerts": [
                ("hazardous_area_intrusion", 0.34),
                ("prolonged_presence", 0.28),
                ("unauthorized_entry", 0.18),
                ("repeated_intrusion", 0.12),
                ("zone_intrusion", 0.08),
            ],
        },
        {
            "location": "Warehouse A",
            "zone": "Loading Dock",
            "zone_type": "restricted",
            "cameras": ["CAM-05", "CAM-06"],
            "shift_weights": [("Morning Shift", 0.40), ("Swing Shift", 0.35), ("Night Shift", 0.25)],
            "alerts": [
                ("unauthorized_entry", 0.36),
                ("repeated_intrusion", 0.22),
                ("zone_intrusion", 0.18),
                ("after_hours_entry", 0.14),
                ("prolonged_presence", 0.10),
            ],
        },
        {
            "location": "Warehouse B",
            "zone": "Dispatch Corridor",
            "zone_type": "restricted",
            "cameras": ["CAM-07", "CAM-08"],
            "shift_weights": [("Night Shift", 0.46), ("Swing Shift", 0.34), ("Morning Shift", 0.20)],
            "alerts": [
                ("after_hours_entry", 0.34),
                ("unauthorized_entry", 0.26),
                ("repeated_intrusion", 0.18),
                ("zone_intrusion", 0.12),
                ("prolonged_presence", 0.10),
            ],
        },
        {
            "location": "Warehouse C",
            "zone": "Storage Bay",
            "zone_type": "restricted",
            "cameras": ["CAM-01", "CAM-02"],
            "shift_weights": [("Morning Shift", 0.44), ("Swing Shift", 0.33), ("Night Shift", 0.23)],
            "alerts": [
                ("unauthorized_entry", 0.30),
                ("zone_intrusion", 0.28),
                ("repeated_intrusion", 0.16),
                ("after_hours_entry", 0.14),
                ("prolonged_presence", 0.12),
            ],
        },
        {
            "location": "Warehouse B",
            "zone": "Chemical Room Access",
            "zone_type": "hazardous",
            "cameras": ["CAM-09", "CAM-10"],
            "shift_weights": [("Morning Shift", 0.18), ("Swing Shift", 0.37), ("Night Shift", 0.45)],
            "alerts": [
                ("hazardous_area_intrusion", 0.42),
                ("after_hours_entry", 0.20),
                ("prolonged_presence", 0.18),
                ("unauthorized_entry", 0.12),
                ("repeated_intrusion", 0.08),
            ],
        },
    ]
    scenario = scenario_catalog[seed_index % len(scenario_catalog)]

    shift = rng.choices(
        [label for label, _ in scenario["shift_weights"]],
        weights=[weight for _, weight in scenario["shift_weights"]],
        k=1,
    )[0]
    if shift == "Morning Shift":
        hour = rng.randint(6, 13)
    elif shift == "Swing Shift":
        hour = rng.randint(14, 21)
    else:
        hour = rng.choice([22, 23, 0, 1, 2, 3, 4, 5])

    minute = rng.randint(0, 59)
    timestamp = _serialize_region_demo_timestamp(day_offset=6 - (seed_index % 6), hour=hour, minute=minute)
    duration_bases = {
        "hazardous_area_intrusion": (120, 260),
        "prolonged_presence": (150, 320),
        "unauthorized_entry": (18, 85),
        "repeated_intrusion": (25, 90),
        "after_hours_entry": (40, 120),
        "zone_intrusion": (10, 55),
    }

    incident_count = rng.randint(3, 6)
    outputs: list[dict[str, Any]] = []
    for incident_index in range(incident_count):
        alert_type = rng.choices(
            [label for label, _ in scenario["alerts"]],
            weights=[weight for _, weight in scenario["alerts"]],
            k=1,
        )[0]
        low_duration, high_duration = duration_bases[alert_type]
        duration_sec = round(rng.uniform(low_duration, high_duration), 2)
        entry_time = round(rng.uniform(4, 220), 2)
        open_incident = rng.random() < 0.16
        exit_time = None if open_incident else round(entry_time + duration_sec, 2)

        if alert_type == "hazardous_area_intrusion":
            severity = "high" if duration_sec >= 150 or rng.random() < 0.7 else "medium"
        elif alert_type == "prolonged_presence":
            severity = "high" if duration_sec >= 220 else "medium"
        elif alert_type in {"after_hours_entry", "repeated_intrusion"}:
            severity = "medium" if duration_sec >= 45 else "low"
        elif alert_type == "unauthorized_entry":
            severity = "medium" if duration_sec >= 55 else "low"
        else:
            severity = "low"

        outputs.append(
            {
                "object_type": "person",
                "authorized": 0,
                "entry_time": entry_time,
                "exit_time": exit_time,
                "duration_sec": duration_sec,
                "alert_type": alert_type,
                "severity": severity,
                "confidence_score": round(rng.uniform(0.74, 0.97), 3),
                "status": "open" if open_incident else "past",
                "notes": "Synthetic warehouse safety history for Region Alerts dashboard demo.",
                "metadata_json": {
                    "tracked_object_id": f"SYN-TRK-{seed_index:03d}-{incident_index + 1:02d}",
                    REGION_SYNTHETIC_METADATA_KEY: True,
                    "shift": shift,
                },
            }
        )

    video_duration = max((output["entry_time"] + max(output["duration_sec"], 15) for output in outputs), default=300) + rng.uniform(30, 120)
    return {
        "source_ref": f"{REGION_SYNTHETIC_SOURCE_PREFIX}:{seed_index:04d}",
        "camera_id": rng.choice(scenario["cameras"]),
        "location": scenario["location"],
        "zone": scenario["zone"],
        "zone_type": scenario["zone_type"],
        "filename": f"region_demo_{seed_index:04d}.mp4",
        "simulated_timestamp": timestamp,
        "load_time_sec": round(video_duration, 2),
        "processing_time_sec": round(rng.uniform(6.5, 18.0), 2),
        "metadata_json": {
            REGION_SYNTHETIC_METADATA_KEY: True,
            "shift": shift,
            "video_duration_sec": round(video_duration, 2),
            "demo_story": scenario["zone"],
        },
        "outputs": outputs,
    }


def _seed_region_synthetic_records(required_outputs: int) -> None:
    seed_index = _next_region_synthetic_seed_index()
    seeded_outputs = 0

    while seeded_outputs < required_outputs:
        synthetic_input = _build_region_synthetic_input(seed_index)
        input_row = upsert_region_alert_input(
            source_ref=synthetic_input["source_ref"],
            integration_run_id=None,
            job_id=None,
            camera_id=synthetic_input["camera_id"],
            location=synthetic_input["location"],
            zone=synthetic_input["zone"],
            zone_type=synthetic_input["zone_type"],
            filename=synthetic_input["filename"],
            minio_video_link="",
            output_video_link="",
            input_bucket=None,
            input_object_key=None,
            output_object_key=None,
            load_time_sec=synthetic_input["load_time_sec"],
            processing_time_sec=synthetic_input["processing_time_sec"],
            simulated_timestamp=synthetic_input["simulated_timestamp"],
            run_status="processed",
            metadata_json=synthetic_input["metadata_json"],
        )
        output_rows = replace_region_alert_outputs(
            input_id=int(input_row["input_id"]),
            outputs=synthetic_input["outputs"],
        )
        seeded_outputs += len(output_rows)
        seed_index += 1


def _ensure_region_demo_dataset() -> None:
    synthetic_count, _real_count = _count_region_records_by_origin()
    if synthetic_count >= REGION_SYNTHETIC_MIN_OUTPUTS:
        return
    _seed_region_synthetic_records(REGION_SYNTHETIC_MIN_OUTPUTS - synthetic_count)
    if isinstance(raw_value, dict):
        return raw_value
    try:
        parsed = json.loads(raw_value)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _matches_filter(value: Any, selected: list[str] | None) -> bool:
    if not selected:
        return True
    return str(value or "") in {str(item) for item in selected if item not in {"", "All"}}


def _group_records(records: list[dict[str, Any]], key: str) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for record in records:
        group_value = str(record.get(key) or "")
        grouped.setdefault(group_value, []).append(record)
    return grouped


def _within_date_range(timestamp: str | None, date_from: str | None, date_to: str | None) -> bool:
    if not timestamp:
        return False
    dt = np.datetime64(timestamp)
    if date_from:
        if dt < np.datetime64(f"{date_from}T00:00:00"):
            return False
    if date_to:
        if dt > np.datetime64(f"{date_to}T23:59:59"):
            return False
    return True


def _safe_zone_facility(location: str, zone: str) -> str:
    if "Warehouse B" in location or zone in {"Forklift Bay", "Storage Bay"}:
        return "Plant 2"
    if "Warehouse C" in location or zone in {"Dispatch Area", "Packaging Zone"}:
        return "Warehouse Annex"
    return "Plant 1"


def _shift_from_timestamp(timestamp: str) -> str:
    try:
        hour = int(str(timestamp)[11:13])
    except Exception:
        hour = 0
    if 6 <= hour < 14:
        return "Morning Shift"
    if 14 <= hour < 22:
        return "Swing Shift"
    return "Night Shift"


def _offset_iso_timestamp(base_timestamp: str, seconds_offset: float | None) -> str:
    if not base_timestamp:
        return _utc_now_iso()
    if not seconds_offset or seconds_offset <= 0:
        return base_timestamp
    return (
        np.datetime64(base_timestamp) + np.timedelta64(int(float(seconds_offset) * 1000), "ms")
    ).astype("datetime64[ms]").astype(str)


def _helmet_vest_shoes_state(value: Any) -> str:
    if value is True or value == 1:
        return "OK"
    if value is False or value == 0:
        return "MISSING"
    return "UNKNOWN"


def _build_ppe_dashboard_records() -> list[dict[str, Any]]:
    query = """
        SELECT
            i.input_id,
            i.source_ref,
            i.camera_id,
            i.location,
            i.zone,
            i.shift,
            i.output_video_link,
            i.output_object_key,
            i.simulated_timestamp,
            i.metadata_json AS input_metadata_json,
            o.output_id,
            o.person_id,
            o.helmet_worn,
            o.vest_worn,
            o.shoes_worn,
            o.violation_type,
            o.confidence_score,
            o.status,
            o.first_seen_frame,
            o.last_seen_frame,
            o.first_seen_sec,
            o.last_seen_sec,
            o.processed_at,
            o.notes,
            o.metadata_json AS output_metadata_json
        FROM ppe_detection_outputs o
        JOIN ppe_detection_inputs i ON i.input_id = o.input_id
        ORDER BY datetime(i.simulated_timestamp) DESC, o.output_id DESC
    """

    with get_connection() as connection:
        rows = connection.execute(query).fetchall()

    records: list[dict[str, Any]] = []
    for row in rows:
        output_meta = _parse_json_blob(row["output_metadata_json"])
        helmet = _helmet_vest_shoes_state(row["helmet_worn"])
        vest = _helmet_vest_shoes_state(row["vest_worn"])
        shoes = _helmet_vest_shoes_state(row["shoes_worn"])
        missing_items = [
            item
            for item, state in [("Helmet", helmet), ("Vest", vest), ("Shoes", shoes)]
            if state == "MISSING"
        ]
        compliance_status = "FAIL" if missing_items else "PASS"
        first_seen_sec = float(row["first_seen_sec"] or 0)
        last_seen_sec = float(row["last_seen_sec"] or first_seen_sec)
        duration_sec = max(0.0, last_seen_sec - first_seen_sec)

        output_video = _build_integration_proxy_url("ppe-detection", row["output_object_key"]) or str(row["output_video_link"] or "")

        records.append(
            {
                "output_id": int(row["output_id"]),
                "input_id": int(row["input_id"]),
                "camera_id": str(row["camera_id"]),
                "location": str(row["location"]),
                "zone": str(row["zone"]),
                "shift": str(row["shift"]),
                "tracked_worker_id": str(row["person_id"]),
                "helmet": helmet,
                "vest": vest,
                "shoes": shoes,
                "compliance_status": compliance_status,
                "missing_items": missing_items,
                "frames_observed": int(output_meta.get("observations") or 0),
                "first_seen_sec": first_seen_sec,
                "last_seen_sec": last_seen_sec,
                "duration_sec": round(duration_sec, 2),
                "confidence_score": float(row["confidence_score"] or 0),
                "processed_at": str(row["processed_at"]),
                "timestamp": str(row["simulated_timestamp"]),
                "output_video_url": output_video,
                "violation_type": str(row["violation_type"] or ""),
                "notes": str(row["notes"] or ""),
            }
        )
    return records


def _build_fire_dashboard_records() -> list[dict[str, Any]]:
    query = """
        SELECT
            i.input_id,
            i.source_ref,
            i.camera_id,
            i.location,
            i.zone,
            i.output_video_link,
            i.output_object_key,
            i.simulated_timestamp,
            i.metadata_json AS input_metadata_json,
            o.output_id,
            o.fire_detected,
            o.smoke_detected,
            o.severity,
            o.alert_type,
            o.confidence_score,
            o.response_time_sec,
            o.status,
            o.notes,
            o.metadata_json AS output_metadata_json
        FROM fire_detection_outputs o
        JOIN fire_detection_inputs i ON i.input_id = o.input_id
        ORDER BY datetime(i.simulated_timestamp) DESC, o.output_id DESC
    """

    with get_connection() as connection:
        rows = connection.execute(query).fetchall()

    records: list[dict[str, Any]] = []
    for row in rows:
        output_meta = _parse_json_blob(row["output_metadata_json"])
        input_meta = _parse_json_blob(row["input_metadata_json"])
        simulated_timestamp = str(row["simulated_timestamp"])
        location = str(row["location"])
        zone = str(row["zone"])

        output_video_url = _build_integration_proxy_url("fire-detection", row["output_object_key"]) or str(row["output_video_link"] or "")
        records.append(
            {
                "output_id": int(row["output_id"]),
                "input_id": int(row["input_id"]),
                "camera_id": str(row["camera_id"]),
                "location": location,
                "facility": str(input_meta.get("facility") or _safe_zone_facility(location, zone)),
                "zone": zone,
                "shift": str(input_meta.get("shift") or _shift_from_timestamp(simulated_timestamp)),
                "alert_type": str(row["alert_type"] or "no_alert"),
                "severity": str(row["severity"] or "none"),
                "confidence_score": float(row["confidence_score"] or 0),
                "fire_detected": "Yes" if int(row["fire_detected"] or 0) else "No",
                "smoke_detected": "Yes" if int(row["smoke_detected"] or 0) else "No",
                "total_fire_events": int(output_meta.get("total_fire_events") or 0),
                "total_smoke_events": int(output_meta.get("total_smoke_events") or 0),
                "output_video_url": output_video_url,
                "simulated_timestamp": simulated_timestamp,
                "is_latest_demo_alert": False,
                "status": str(row["status"] or "alert"),
            }
        )
    return records


def _filter_ppe_dashboard_records(
    records: list[dict[str, Any]],
    *,
    date_from: str | None,
    date_to: str | None,
    location: str | None,
    zone: list[str] | None,
    camera_id: list[str] | None,
    shift: list[str] | None,
    compliance_status: str | None,
) -> list[dict[str, Any]]:
    normalized_status = str(compliance_status or "").strip().upper()
    return [
        record
        for record in records
        if _within_date_range(record["timestamp"], date_from, date_to)
        and (not location or location == "All" or record["location"] == location)
        and _matches_filter(record["zone"], zone)
        and _matches_filter(record["camera_id"], camera_id)
        and _matches_filter(record["shift"], shift)
        and (not normalized_status or normalized_status == "ALL" or record["compliance_status"] == normalized_status)
    ]


def _filter_fire_dashboard_records(
    records: list[dict[str, Any]],
    *,
    date_from: str | None,
    date_to: str | None,
    location: str | None,
    zone: list[str] | None,
    camera_id: list[str] | None,
    facility: str | None,
    shift: list[str] | None,
    alert_type: list[str] | None,
    severity: list[str] | None,
) -> list[dict[str, Any]]:
    return [
        record
        for record in records
        if _within_date_range(record["simulated_timestamp"], date_from, date_to)
        and (not location or location == "All" or record["location"] == location)
        and (not facility or facility == "All" or record["facility"] == facility)
        and _matches_filter(record["zone"], zone)
        and _matches_filter(record["camera_id"], camera_id)
        and _matches_filter(record["shift"], shift)
        and _matches_filter(record["alert_type"], alert_type)
        and _matches_filter(record["severity"], severity)
    ]


def _build_speed_dashboard_records() -> list[dict[str, Any]]:
    query = """
        SELECT
            i.input_id,
            i.camera_id,
            i.location,
            i.zone,
            i.zone_speed_limit_kmh,
            i.output_video_link,
            i.output_object_key,
            i.simulated_timestamp,
            o.output_id,
            o.object_id,
            o.object_type,
            o.detected_speed_kmh,
            o.speed_limit_kmh,
            o.is_overspeeding,
            o.excess_speed_kmh,
            o.confidence_score,
            o.status,
            o.notes,
            o.metadata_json AS output_metadata_json
        FROM speed_estimation_outputs o
        JOIN speed_estimation_inputs i ON i.input_id = o.input_id
        ORDER BY datetime(i.simulated_timestamp) DESC, o.output_id DESC
    """

    with get_connection() as connection:
        rows = connection.execute(query).fetchall()

    records: list[dict[str, Any]] = []
    for row in rows:
        output_meta = _parse_json_blob(row["output_metadata_json"])
        timestamp = str(row["simulated_timestamp"] or _utc_now_iso())
        estimated_speed = round(float(row["detected_speed_kmh"] or 0), 1)
        speed_limit = round(float(row["speed_limit_kmh"] or row["zone_speed_limit_kmh"] or 0), 1)
        overspeed_value = row["is_overspeeding"]
        is_overspeeding = bool(int(overspeed_value)) if overspeed_value is not None else estimated_speed > speed_limit
        output_video_url = _build_integration_proxy_url("speed-estimation", row["output_object_key"]) or str(row["output_video_link"] or "")

        records.append(
            {
                "input_id": int(row["input_id"]),
                "output_id": int(row["output_id"]),
                "camera_id": str(row["camera_id"]),
                "location": str(row["location"]),
                "zone": str(row["zone"]),
                "object_id": str(row["object_id"]),
                "object_type": str(row["object_type"] or "vehicle"),
                "estimated_speed": estimated_speed,
                "speed_limit": speed_limit,
                "violation_type": "overspeed" if is_overspeeding else "within_limit",
                "status": str(row["status"] or ("Violation" if is_overspeeding else "Normal")),
                "confidence_score": round(float(row["confidence_score"] or 0), 4),
                "timestamp": timestamp,
                "output_video_url": output_video_url,
                "is_overspeeding": is_overspeeding,
                "excess_speed_kmh": round(float(row["excess_speed_kmh"] or max(estimated_speed - speed_limit, 0)), 1),
                "first_seen_sec": output_meta.get("first_seen_sec"),
                "last_seen_sec": output_meta.get("last_seen_sec"),
                "crossed_line": bool(output_meta.get("crossed_line")),
                "direction": str(output_meta.get("direction") or "unknown"),
                "class_count_for_type": int(output_meta.get("class_count_for_type") or 0),
                "notes": str(row["notes"] or ""),
            }
        )
    return records


def _build_crack_dashboard_records() -> list[dict[str, Any]]:
    query = """
        SELECT
            i.input_id,
            i.camera_id,
            i.location,
            i.zone,
            i.filename,
            i.minio_input_link,
            i.output_media_link,
            i.output_video_link,
            i.output_object_key,
            i.simulated_timestamp,
            i.processed_at,
            i.run_status,
            i.metadata_json AS input_metadata_json,
            o.output_id,
            o.crack_detected,
            o.crack_count,
            o.frames_analyzed,
            o.frames_with_cracks,
            o.crack_rate_pct,
            o.max_confidence,
            o.avg_confidence,
            o.severity,
            o.status,
            o.metadata_json AS output_metadata_json
        FROM crack_detection_outputs o
        JOIN crack_detection_inputs i ON i.input_id = o.input_id
        ORDER BY datetime(i.simulated_timestamp) DESC, o.output_id DESC
    """

    with get_connection() as connection:
        rows = connection.execute(query).fetchall()

    records: list[dict[str, Any]] = []
    for row in rows:
        input_meta = _parse_json_blob(row["input_metadata_json"])
        output_meta = _parse_json_blob(row["output_metadata_json"])
        crack_events = output_meta.get("defect_events", output_meta.get("crack_events", []))
        if not isinstance(crack_events, list):
            crack_events = []

        output_url = _build_integration_proxy_url("crack-detection", row["output_object_key"]) or str(row["output_media_link"] or row["output_video_link"] or "")
        simulated_timestamp = str(row["simulated_timestamp"] or row["processed_at"] or _utc_now_iso())
        confidence_values = [
            float(event.get("confidence_score") or 0)
            for event in crack_events
            if isinstance(event, dict)
        ]
        highest_event_confidence = max(confidence_values) if confidence_values else 0.0

        records.append(
            {
                "input_id": int(row["input_id"]),
                "output_id": int(row["output_id"]),
                "camera_id": str(row["camera_id"] or ""),
                "location": str(row["location"] or ""),
                "zone": str(row["zone"] or ""),
                "filename": str(row["filename"] or ""),
                "minio_input_link": str(row["minio_input_link"] or ""),
                "output_media_link": str(row["output_media_link"] or row["output_video_link"] or ""),
                "output_video_url": output_url,
                "simulated_timestamp": simulated_timestamp,
                "timestamp": simulated_timestamp,
                "crack_detected": bool(int(row["crack_detected"] or 0)),
                "crack_count": int(row["crack_count"] or 0),
                "frames_analyzed": int(row["frames_analyzed"] or 0),
                "frames_with_cracks": int(row["frames_with_cracks"] or 0),
                "crack_rate_pct": float(row["crack_rate_pct"] or 0),
                "max_confidence": float(row["max_confidence"] or 0),
                "avg_confidence": float(row["avg_confidence"] or 0),
                "severity": str(row["severity"] or "none"),
                "status": str(row["status"] or row["run_status"] or "processed"),
                "processed_at": str(row["processed_at"] or ""),
                "metadata_json": output_meta,
                "crack_events": crack_events,
                "highest_event_confidence": highest_event_confidence,
                "video_summary": output_meta.get("video_summary", {}) if isinstance(output_meta.get("video_summary"), dict) else {},
                "input_metadata": input_meta,
            }
        )
    return records


def _build_unsafe_behavior_dashboard_records() -> list[dict[str, Any]]:
    query = """
        SELECT
            i.input_id,
            i.camera_id,
            i.location,
            i.zone,
            i.filename,
            i.minio_input_link,
            i.output_media_link,
            i.output_video_link,
            i.output_object_key,
            i.simulated_timestamp,
            i.processed_at,
            i.run_status,
            i.metadata_json AS input_metadata_json,
            o.output_id,
            o.event_type,
            o.confidence,
            o.bbox_json,
            o.source,
            o.associated_person_box_json,
            o.severity,
            o.status,
            o.frame_number,
            o.timestamp_sec,
            o.metadata_json AS output_metadata_json
        FROM unsafe_behavior_outputs o
        JOIN unsafe_behavior_inputs i ON i.input_id = o.input_id
        ORDER BY datetime(i.simulated_timestamp) DESC, o.output_id DESC
    """

    with get_connection() as connection:
        rows = connection.execute(query).fetchall()

    records: list[dict[str, Any]] = []
    for row in rows:
        input_meta = _parse_json_blob(row["input_metadata_json"])
        output_meta = _parse_json_blob(row["output_metadata_json"])
        summary_metrics = output_meta.get("summary_metrics", {}) if isinstance(output_meta.get("summary_metrics"), dict) else {}
        video_summary = output_meta.get("video_summary", {}) if isinstance(output_meta.get("video_summary"), dict) else {}
        output_url = _build_integration_proxy_url("unsafe-behavior-detection", row["output_object_key"]) or str(row["output_media_link"] or row["output_video_link"] or "")
        simulated_timestamp = str(row["simulated_timestamp"] or row["processed_at"] or _utc_now_iso())

        try:
            bbox = json.loads(row["bbox_json"]) if row["bbox_json"] else []
        except Exception:
            bbox = []
        try:
            associated_person_box = json.loads(row["associated_person_box_json"]) if row["associated_person_box_json"] else []
        except Exception:
            associated_person_box = []

        records.append(
            {
                "input_id": int(row["input_id"]),
                "output_id": int(row["output_id"]),
                "camera_id": str(row["camera_id"] or ""),
                "location": str(row["location"] or ""),
                "zone": str(row["zone"] or ""),
                "filename": str(row["filename"] or ""),
                "minio_input_link": str(row["minio_input_link"] or ""),
                "output_media_link": str(row["output_media_link"] or row["output_video_link"] or ""),
                "output_video_url": output_url,
                "simulated_timestamp": simulated_timestamp,
                "timestamp": simulated_timestamp,
                "event_type": str(row["event_type"] or "unsafe"),
                "confidence": float(row["confidence"] or 0),
                "severity": str(row["severity"] or "low"),
                "source": str(row["source"] or ""),
                "status": str(row["status"] or row["run_status"] or "unsafe"),
                "processed_at": str(row["processed_at"] or ""),
                "frame_number": int(row["frame_number"] or 0),
                "timestamp_sec": float(row["timestamp_sec"] or 0),
                "bbox": bbox,
                "associated_person_box": associated_person_box,
                "total_unsafe_events": int(summary_metrics.get("total_unsafe_events") or 0),
                "smoking_events": int(summary_metrics.get("smoking_events") or 0),
                "phone_usage_events": int(summary_metrics.get("phone_usage_events") or 0),
                "frames_analyzed": int(summary_metrics.get("frames_analyzed") or 0),
                "frames_with_unsafe_behavior": int(summary_metrics.get("frames_with_unsafe_behavior") or 0),
                "unsafe_rate_pct": float(summary_metrics.get("unsafe_rate_pct") or 0),
                "max_confidence": float(summary_metrics.get("max_confidence") or 0),
                "avg_confidence": float(summary_metrics.get("avg_confidence") or 0),
                "video_summary": video_summary,
                "metadata_json": output_meta,
                "input_metadata": input_meta,
            }
        )
    return records


def _filter_speed_dashboard_records(
    records: list[dict[str, Any]],
    *,
    date_from: str | None,
    date_to: str | None,
    location: str | None,
    zone: list[str] | None,
    camera_id: list[str] | None,
    object_type: list[str] | None,
    status: str | None,
) -> list[dict[str, Any]]:
    normalized_status = str(status or "").strip().lower()
    return [
        record
        for record in records
        if _within_date_range(record["timestamp"], date_from, date_to)
        and (not location or location == "All" or record["location"] == location)
        and _matches_filter(record["zone"], zone)
        and _matches_filter(record["camera_id"], camera_id)
        and _matches_filter(record["object_type"], object_type)
        and (
            not normalized_status
            or normalized_status == "all"
            or str(record["status"]).lower() == normalized_status
        )
    ]


def _filter_crack_dashboard_records(
    records: list[dict[str, Any]],
    *,
    date_from: str | None,
    date_to: str | None,
    location: str | None,
    zone: list[str] | None,
    camera_id: list[str] | None,
    severity: list[str] | None,
    status: str | None,
) -> list[dict[str, Any]]:
    normalized_status = str(status or "").strip().lower()
    return [
        record
        for record in records
        if _within_date_range(record["timestamp"], date_from, date_to)
        and (not location or location == "All" or record["location"] == location)
        and _matches_filter(record["zone"], zone)
        and _matches_filter(record["camera_id"], camera_id)
        and _matches_filter(record["severity"], severity)
        and (not normalized_status or normalized_status == "all" or str(record["status"]).lower() == normalized_status)
    ]


def _filter_unsafe_behavior_dashboard_records(
    records: list[dict[str, Any]],
    *,
    date_from: str | None,
    date_to: str | None,
    location: str | None,
    zone: list[str] | None,
    camera_id: list[str] | None,
    event_type: list[str] | None,
    severity: list[str] | None,
    status: str | None,
) -> list[dict[str, Any]]:
    normalized_status = str(status or "").strip().lower()
    return [
        record
        for record in records
        if _within_date_range(record["timestamp"], date_from, date_to)
        and (not location or location == "All" or record["location"] == location)
        and _matches_filter(record["zone"], zone)
        and _matches_filter(record["camera_id"], camera_id)
        and _matches_filter(record["event_type"], event_type)
        and _matches_filter(record["severity"], severity)
        and (not normalized_status or normalized_status == "all" or str(record["status"]).lower() == normalized_status)
    ]


def _build_region_dashboard_records() -> list[dict[str, Any]]:
    query = """
        SELECT
            i.input_id,
            i.source_ref,
            i.camera_id,
            i.location,
            i.zone,
            i.zone_type,
            i.output_video_link,
            i.output_object_key,
            i.simulated_timestamp,
            i.processed_at,
            i.load_time_sec,
            i.metadata_json AS input_metadata_json,
            o.output_id,
            o.object_type,
            o.entry_time,
            o.exit_time,
            o.duration_sec,
            o.alert_type,
            o.severity,
            o.confidence_score,
            o.status,
            o.notes,
            o.metadata_json AS output_metadata_json
        FROM region_alert_outputs o
        JOIN region_alert_inputs i ON i.input_id = o.input_id
        ORDER BY datetime(i.simulated_timestamp) DESC, o.output_id DESC
    """

    with get_connection() as connection:
        rows = connection.execute(query).fetchall()

    latest_non_synthetic_input_id = None
    latest_any_input_id = rows[0]["input_id"] if rows else None
    records: list[dict[str, Any]] = []
    for index, row in enumerate(rows):
        input_meta = _parse_json_blob(row["input_metadata_json"])
        output_meta = _parse_json_blob(row["output_metadata_json"])
        is_synthetic_demo = bool(
            str(row["source_ref"] or "").startswith(f"{REGION_SYNTHETIC_SOURCE_PREFIX}:")
            or input_meta.get(REGION_SYNTHETIC_METADATA_KEY)
        )
        if latest_non_synthetic_input_id is None and not is_synthetic_demo:
            latest_non_synthetic_input_id = row["input_id"]
        timestamp = str(row["simulated_timestamp"] or row["processed_at"] or _utc_now_iso())
        duration_sec = float(row["duration_sec"] or 0)
        entry_time = float(row["entry_time"] or 0)
        exit_time = row["exit_time"]
        video_duration_sec = float(row["load_time_sec"] or input_meta.get("video_duration_sec") or 0)
        explicit_status = str(row["status"] or "").strip().lower()

        if explicit_status in {"open", "active"}:
            status = "Open"
        elif explicit_status in {"past", "resolved", "closed"}:
            status = "Past"
        elif exit_time is None:
            status = "Open"
        elif video_duration_sec and float(exit_time) >= max(video_duration_sec - 1.5, 0):
            status = "Open"
        else:
            status = "Past"

        output_video_url = _build_integration_proxy_url("region-alerts", row["output_object_key"]) or str(row["output_video_link"] or "")
        records.append(
            {
                "incident_id": int(row["output_id"]),
                "input_id": int(row["input_id"]),
                "timestamp": timestamp,
                "camera_id": str(row["camera_id"]),
                "location": str(row["location"]),
                "zone": str(row["zone"]),
                "zone_type": str(row["zone_type"] or input_meta.get("zone_type") or "Restricted"),
                "shift": _shift_from_timestamp(timestamp),
                "object_type": str(row["object_type"] or "person").title(),
                "entry_time": _offset_iso_timestamp(timestamp, entry_time),
                "exit_time": (
                    ""
                    if exit_time is None
                    else _offset_iso_timestamp(timestamp, float(exit_time))
                ),
                "duration_sec": round(duration_sec, 2),
                "alert_type": str(row["alert_type"] or "zone_intrusion").replace("_", " ").title(),
                "severity": str(row["severity"] or "low").title(),
                "status": status,
                "confidence_score": float(row["confidence_score"] or 0),
                "tracked_object_id": str(output_meta.get("tracked_object_id") or f"TRK-{index + 1:04d}"),
                "input_reference": f"region_alert_inputs:{int(row['input_id'])}",
                "output_reference": output_video_url,
                "notes": str(row["notes"] or ""),
                "is_latest_demo_incident": (
                    (latest_non_synthetic_input_id or latest_any_input_id) is not None
                    and int(row["input_id"]) == int(latest_non_synthetic_input_id or latest_any_input_id)
                ),
                "is_synthetic_demo": is_synthetic_demo,
            }
        )

    return records


def _filter_region_dashboard_records(
    records: list[dict[str, Any]],
    *,
    date_from: str | None,
    date_to: str | None,
    location: str | None,
    zone: list[str] | None,
    camera_id: list[str] | None,
    zone_type: list[str] | None,
    object_type: list[str] | None,
    shift: list[str] | None,
    severity: list[str] | None,
    status: str | None,
) -> list[dict[str, Any]]:
    normalized_status = str(status or "").strip().lower()
    return [
        record
        for record in records
        if _within_date_range(record["entry_time"] or record["timestamp"], date_from, date_to)
        and (not location or location == "All" or record["location"] == location)
        and _matches_filter(record["zone"], zone)
        and _matches_filter(record["camera_id"], camera_id)
        and _matches_filter(record["zone_type"], zone_type)
        and _matches_filter(record["object_type"], object_type)
        and _matches_filter(record["shift"], shift)
        and _matches_filter(record["severity"], severity)
        and (not normalized_status or normalized_status == "all" or record["status"].lower() == normalized_status)
    ]


@app.get("/api/region-alerts/metrics", tags=["Dashboard"])
def get_region_alert_metrics(
    date_from: str | None = None,
    date_to: str | None = None,
    location: str | None = None,
    zone: list[str] | None = Query(default=None),
    camera_id: list[str] | None = Query(default=None),
    zone_type: list[str] | None = Query(default=None),
    object_type: list[str] | None = Query(default=None),
    shift: list[str] | None = Query(default=None),
    severity: list[str] | None = Query(default=None),
    status: str | None = None,
) -> dict[str, Any]:
    _ensure_region_demo_dataset()
    records = _filter_region_dashboard_records(
        _build_region_dashboard_records(),
        date_from=date_from,
        date_to=date_to,
        location=location,
        zone=zone,
        camera_id=camera_id,
        zone_type=zone_type,
        object_type=object_type,
        shift=shift,
        severity=severity,
        status=status,
    )

    incident_records = [record for record in records if record["alert_type"]]
    summary = {
        "total_incidents": len(incident_records),
        "open_incidents": sum(1 for record in incident_records if record["status"] == "Open"),
        "critical_incidents": sum(1 for record in incident_records if record["severity"] == "High"),
        "most_violated_zone": max(_group_records(incident_records, "zone").items(), key=lambda item: len(item[1]))[0] if incident_records else "No incidents",
        "most_triggered_camera": max(_group_records(incident_records, "camera_id").items(), key=lambda item: len(item[1]))[0] if incident_records else "No incidents",
    }

    return {
        "summary": summary,
        "records": records,
    }


@app.get("/api/ppe/metrics", tags=["Dashboard"])
def get_ppe_metrics(
    date_from: str | None = None,
    date_to: str | None = None,
    location: str | None = None,
    zone: list[str] | None = Query(default=None),
    camera_id: list[str] | None = Query(default=None),
    shift: list[str] | None = Query(default=None),
    compliance_status: str | None = None,
) -> dict[str, Any]:
    records = _filter_ppe_dashboard_records(
        _build_ppe_dashboard_records(),
        date_from=date_from,
        date_to=date_to,
        location=location,
        zone=zone,
        camera_id=camera_id,
        shift=shift,
        compliance_status=compliance_status,
    )

    violations = [record for record in records if record["compliance_status"] == "FAIL"]
    unique_workers = {f'{record["input_id"]}:{record["tracked_worker_id"]}' for record in records}
    summary = {
        "total_workers_checked": len(unique_workers),
        "total_violations": len(violations),
        "compliance_rate": round(((len(records) - len(violations)) / len(records)) * 100, 1) if records else 0.0,
        "missing_helmet_count": sum(1 for record in records if record["helmet"] == "MISSING"),
        "missing_vest_count": sum(1 for record in records if record["vest"] == "MISSING"),
        "missing_shoes_count": sum(1 for record in records if record["shoes"] == "MISSING"),
    }

    return {
        "summary": summary,
        "violations_by_zone": [
            {"zone": zone_name, "count": len(items)}
            for zone_name, items in sorted(_group_records(violations, "zone").items(), key=lambda item: len(item[1]), reverse=True)
        ],
        "records": records,
    }


@app.get("/api/fire/metrics", tags=["Dashboard"])
def get_fire_metrics(
    date_from: str | None = None,
    date_to: str | None = None,
    location: str | None = None,
    zone: list[str] | None = Query(default=None),
    camera_id: list[str] | None = Query(default=None),
    facility: str | None = None,
    shift: list[str] | None = Query(default=None),
    alert_type: list[str] | None = Query(default=None),
    severity: list[str] | None = Query(default=None),
) -> dict[str, Any]:
    records = _filter_fire_dashboard_records(
        _build_fire_dashboard_records(),
        date_from=date_from,
        date_to=date_to,
        location=location,
        zone=zone,
        camera_id=camera_id,
        facility=facility,
        shift=shift,
        alert_type=alert_type,
        severity=severity,
    )

    true_alerts = [record for record in records if record["alert_type"] != "no_alert"]
    summary = {
        "total_incidents": len(true_alerts),
        "critical_alerts": sum(1 for record in records if record["severity"] == "high"),
        "fire_and_smoke_alerts": sum(1 for record in records if record["alert_type"] == "fire_and_smoke"),
        "smoke_only_warnings": sum(1 for record in records if record["alert_type"] == "smoke_only"),
        "most_affected_zone": max(_group_records(true_alerts, "zone").items(), key=lambda item: len(item[1]))[0] if true_alerts else "No alerts",
        "most_triggered_camera": max(_group_records(true_alerts, "camera_id").items(), key=lambda item: len(item[1]))[0] if true_alerts else "No alerts",
    }

    return {
        "summary": summary,
        "records": records,
    }


@app.get("/api/speed-estimation/metrics", tags=["Dashboard"])
def get_speed_estimation_metrics(
    date_from: str | None = None,
    date_to: str | None = None,
    location: str | None = None,
    zone: list[str] | None = Query(default=None),
    camera_id: list[str] | None = Query(default=None),
    object_type: list[str] | None = Query(default=None),
    status: str | None = None,
) -> dict[str, Any]:
    records = _filter_speed_dashboard_records(
        _build_speed_dashboard_records(),
        date_from=date_from,
        date_to=date_to,
        location=location,
        zone=zone,
        camera_id=camera_id,
        object_type=object_type,
        status=status,
    )

    speeds = [float(record["estimated_speed"]) for record in records if record.get("estimated_speed") is not None]
    violations = [record for record in records if record["violation_type"] == "overspeed"]
    unique_objects: dict[tuple[int, str], dict[str, Any]] = {}
    for record in records:
        object_key = (int(record.get("input_id") or 0), str(record.get("object_id") or record.get("output_id") or ""))
        unique_objects[object_key] = record

    class_wise_counts: dict[str, int] = {}
    class_wise_crossed_counts: dict[str, int] = {}
    crossed_vehicle_count = 0
    for record in unique_objects.values():
        object_type = str(record.get("object_type") or "vehicle")
        class_wise_counts[object_type] = class_wise_counts.get(object_type, 0) + 1
        if bool(record.get("crossed_line")):
            crossed_vehicle_count += 1
            class_wise_crossed_counts[object_type] = class_wise_crossed_counts.get(object_type, 0) + 1

    summary = {
        "total_records": len(records),
        "total_vehicles": len(unique_objects),
        "violations": len(violations),
        "speeding_violations": len(violations),
        "avg_speed": round(sum(speeds) / len(speeds), 1) if speeds else 0.0,
        "avg_speed_kmh": round(sum(speeds) / len(speeds), 1) if speeds else 0.0,
        "max_speed": round(max(speeds), 1) if speeds else 0.0,
        "max_speed_kmh": round(max(speeds), 1) if speeds else 0.0,
        "crossed_vehicle_count": crossed_vehicle_count,
        "class_wise_counts": class_wise_counts,
        "class_wise_crossed_counts": class_wise_crossed_counts,
    }

    return {
        "records": records,
        "summary": summary,
    }


@app.get("/api/crack-detection/metrics", tags=["Dashboard"])
def get_crack_detection_metrics(
    date_from: str | None = None,
    date_to: str | None = None,
    location: str | None = None,
    zone: list[str] | None = Query(default=None),
    camera_id: list[str] | None = Query(default=None),
    severity: list[str] | None = Query(default=None),
    status: str | None = None,
) -> dict[str, Any]:
    records = _filter_crack_dashboard_records(
        _build_crack_dashboard_records(),
        date_from=date_from,
        date_to=date_to,
        location=location,
        zone=zone,
        camera_id=camera_id,
        severity=severity,
        status=status,
    )

    crack_detected_rows = [record for record in records if record["crack_detected"]]
    total_items = len(records)
    crack_detected_count = len(crack_detected_rows)
    crack_free_count = total_items - crack_detected_count
    total_crack_detections = sum(int(record["crack_count"] or 0) for record in records)
    avg_confidence_values = [float(record["avg_confidence"] or 0) for record in crack_detected_rows if float(record["avg_confidence"] or 0) > 0]
    max_confidence_values = [float(record["max_confidence"] or 0) for record in records if float(record["max_confidence"] or 0) > 0]

    severity_distribution = {
        "low": sum(1 for record in records if str(record["severity"]).lower() == "low"),
        "medium": sum(1 for record in records if str(record["severity"]).lower() == "medium"),
        "high": sum(1 for record in records if str(record["severity"]).lower() == "high"),
    }

    trend_buckets: dict[str, list[dict[str, Any]]] = {}
    for record in records:
        date_label = str(record.get("timestamp", ""))[:10]
        trend_buckets.setdefault(date_label, []).append(record)
    crack_detection_trend = [
        {
            "date": date_label,
            "crack_count": sum(int(item["crack_count"] or 0) for item in items),
            "crack_detected": sum(1 for item in items if item["crack_detected"]),
            "inspected_items": len(items),
        }
        for date_label, items in sorted(trend_buckets.items(), key=lambda item: item[0])
    ]

    location_groups = _group_records(records, "location")
    camera_or_location_breakdown = [
        {
            "location": location_key,
            "camera_ids": sorted({str(item["camera_id"]) for item in items if item.get("camera_id")}),
            "zones": sorted({str(item["zone"]) for item in items if item.get("zone")}),
            "inspected_items": len(items),
            "crack_detected_count": sum(1 for item in items if item["crack_detected"]),
            "crack_count": sum(int(item["crack_count"] or 0) for item in items),
            "crack_rate_pct": round(
                (sum(1 for item in items if item["crack_detected"]) / len(items)) * 100,
                1,
            ) if items else 0.0,
        }
        for location_key, items in sorted(location_groups.items(), key=lambda item: len(item[1]), reverse=True)
    ]

    recent_crack_events = [
        {
            "input_id": record["input_id"],
            "output_id": record["output_id"],
            "camera_id": record["camera_id"],
            "location": record["location"],
            "zone": record["zone"],
            "crack_detected": record["crack_detected"],
            "crack_count": record["crack_count"],
            "frames_analyzed": record["frames_analyzed"],
            "crack_rate_pct": record["crack_rate_pct"],
            "max_confidence": record["max_confidence"],
            "avg_confidence": record["avg_confidence"],
            "severity": record["severity"],
            "status": record["status"],
            "simulated_timestamp": record["timestamp"],
            "output_video_url": record["output_video_url"],
        }
        for record in records[:25]
    ]

    latest_inspection_time = records[0]["timestamp"] if records else None

    summary = {
        "total_inspected_items": total_items,
        "crack_detected_count": crack_detected_count,
        "crack_free_count": crack_free_count,
        "crack_rate_pct": round((crack_detected_count / total_items) * 100, 1) if total_items else 0.0,
        "total_crack_detections": total_crack_detections,
        "avg_confidence": round(sum(avg_confidence_values) / len(avg_confidence_values), 4) if avg_confidence_values else 0.0,
        "max_confidence": round(max(max_confidence_values), 4) if max_confidence_values else 0.0,
        "high_severity_count": severity_distribution["high"],
        "medium_severity_count": severity_distribution["medium"],
        "low_severity_count": severity_distribution["low"],
        "latest_inspection_time": latest_inspection_time,
    }

    return {
        "summary": summary,
        "severity_distribution": severity_distribution,
        "crack_detection_trend": crack_detection_trend,
        "camera_or_location_breakdown": camera_or_location_breakdown,
        "recent_crack_events": recent_crack_events,
        "records": records,
    }


@app.get("/api/unsafe-behavior/metrics", tags=["Dashboard"])
def get_unsafe_behavior_metrics(
    date_from: str | None = None,
    date_to: str | None = None,
    location: str | None = None,
    zone: list[str] | None = Query(default=None),
    camera_id: list[str] | None = Query(default=None),
    event_type: list[str] | None = Query(default=None),
    severity: list[str] | None = Query(default=None),
    status: str | None = None,
) -> dict[str, Any]:
    records = _filter_unsafe_behavior_dashboard_records(
        _build_unsafe_behavior_dashboard_records(),
        date_from=date_from,
        date_to=date_to,
        location=location,
        zone=zone,
        camera_id=camera_id,
        event_type=event_type,
        severity=severity,
        status=status,
    )

    total_inspected_items = len({int(record["input_id"]) for record in records}) if records else 0
    total_unsafe_events = len(records)
    smoking_events = sum(1 for record in records if str(record["event_type"]).lower() == "smoking")
    phone_usage_events = sum(1 for record in records if str(record["event_type"]).lower() == "phone_usage")
    frames_analyzed = max((int(record["frames_analyzed"] or 0) for record in records), default=0)
    frames_with_unsafe_behavior = max((int(record["frames_with_unsafe_behavior"] or 0) for record in records), default=0)
    confidence_values = [float(record["confidence"] or 0) for record in records if float(record["confidence"] or 0) > 0]

    event_type_distribution = {
        "smoking": smoking_events,
        "phone_usage": phone_usage_events,
    }
    severity_distribution = {
        "low": sum(1 for record in records if str(record["severity"]).lower() == "low"),
        "medium": sum(1 for record in records if str(record["severity"]).lower() == "medium"),
        "high": sum(1 for record in records if str(record["severity"]).lower() == "high"),
    }

    trend_buckets: dict[str, list[dict[str, Any]]] = {}
    for record in records:
        date_label = str(record.get("timestamp", ""))[:10]
        trend_buckets.setdefault(date_label, []).append(record)
    unsafe_event_trend = [
        {
            "date": date_label,
            "smoking_count": sum(1 for item in items if str(item["event_type"]).lower() == "smoking"),
            "phone_usage_count": sum(1 for item in items if str(item["event_type"]).lower() == "phone_usage"),
            "total_unsafe_count": len(items),
        }
        for date_label, items in sorted(trend_buckets.items(), key=lambda item: item[0])
    ]

    location_groups = _group_records(records, "location")
    camera_or_location_breakdown = [
        {
            "location": location_key,
            "camera_ids": sorted({str(item["camera_id"]) for item in items if item.get("camera_id")}),
            "zones": sorted({str(item["zone"]) for item in items if item.get("zone")}),
            "unsafe_event_count": len(items),
            "smoking_count": sum(1 for item in items if str(item["event_type"]).lower() == "smoking"),
            "phone_usage_count": sum(1 for item in items if str(item["event_type"]).lower() == "phone_usage"),
        }
        for location_key, items in sorted(location_groups.items(), key=lambda item: len(item[1]), reverse=True)
    ]

    recent_unsafe_events = [
        {
            "input_id": record["input_id"],
            "output_id": record["output_id"],
            "camera_id": record["camera_id"],
            "location": record["location"],
            "zone": record["zone"],
            "event_type": record["event_type"],
            "confidence": record["confidence"],
            "severity": record["severity"],
            "source": record["source"],
            "frame_number": record["frame_number"],
            "timestamp_sec": record["timestamp_sec"],
            "status": record["status"],
            "simulated_timestamp": record["timestamp"],
            "output_video_url": record["output_video_url"],
        }
        for record in records[:50]
    ]

    latest_event_time = records[0]["timestamp"] if records else None
    summary = {
        "total_inspected_items": total_inspected_items,
        "total_unsafe_events": total_unsafe_events,
        "smoking_events": smoking_events,
        "phone_usage_events": phone_usage_events,
        "unsafe_rate_pct": round((total_unsafe_events / total_inspected_items) * 100, 1) if total_inspected_items else 0.0,
        "frames_analyzed": frames_analyzed,
        "frames_with_unsafe_behavior": frames_with_unsafe_behavior,
        "avg_confidence": round(sum(confidence_values) / len(confidence_values), 4) if confidence_values else 0.0,
        "max_confidence": round(max(confidence_values), 4) if confidence_values else 0.0,
        "high_severity_count": severity_distribution["high"],
        "medium_severity_count": severity_distribution["medium"],
        "low_severity_count": severity_distribution["low"],
        "latest_event_time": latest_event_time,
    }

    return {
        "summary": summary,
        "event_type_distribution": event_type_distribution,
        "severity_distribution": severity_distribution,
        "unsafe_event_trend": unsafe_event_trend,
        "camera_or_location_breakdown": camera_or_location_breakdown,
        "recent_unsafe_events": recent_unsafe_events,
        "records": records,
    }


# ── Root & Health ─────────────────────────────────────────────────────────

@app.get("/", tags=["Root"])
def root() -> RedirectResponse:
    return RedirectResponse(url="/docs", status_code=307)


@app.get("/health", tags=["Health"])
def health_check() -> dict[str, str]:
    return {"status": "ok", "environment": settings.app_env}


# ── Use Cases Registry ───────────────────────────────────────────────────

@app.get("/api/use-cases", tags=["Use Cases"], response_model=list[UseCaseInfo])
def get_use_cases() -> list[UseCaseInfo]:
    """List all available pre-built use cases."""
    items = list_use_cases()
    return [
        UseCaseInfo(
            id=item["id"],
            title=item["title"],
            category=item["category"],
            description=item["description"],
            default_model=item["default_model"],
            metrics_keys=item.get("metrics_keys", []),
        )
        for item in items
    ]


# ── Image Analysis (existing) ────────────────────────────────────────────

@app.post("/api/analyze-image", tags=["Inference"])
async def analyze_image(file: UploadFile = File(...)) -> dict[str, object]:
    contents = await file.read()
    np_buffer = np.frombuffer(contents, dtype=np.uint8)
    image = cv2.imdecode(np_buffer, cv2.IMREAD_COLOR)

    if image is None:
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid image.")

    annotated_image, detections = run_yolo_inference(image)

    return {
        "status": "success",
        "detections": detections,
        "image_base64": image_to_base64(annotated_image),
        "model_source": YOLO_MODEL_SOURCE,
    }


@app.post("/api/playground-preview", tags=["Inference"])
async def playground_preview(
    file: UploadFile = File(...),
    use_case_id: str = Form(...),
    fire_detection_mode: str | None = Form(None),
    ppe_detection_mode: str | None = Form(None),
    speed_detection_class: str | None = Form(None),
    roi_json: str | None = Form(None),
) -> dict[str, object]:
    meta = get_metadata(use_case_id)
    if meta is None:
        raise HTTPException(status_code=404, detail=f"Unknown use case: {use_case_id}")

    file_kind = detect_file_kind(file)
    contents = await file.read()

    temp_path: Path | None = None

    if file_kind == "image":
        np_buffer = np.frombuffer(contents, dtype=np.uint8)
        frame = cv2.imdecode(np_buffer, cv2.IMREAD_COLOR)
        if frame is None:
            raise HTTPException(status_code=400, detail="Uploaded file is not a valid image.")
    else:
        suffix = Path(file.filename or "preview.mp4").suffix or ".mp4"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_video:
            temp_video.write(contents)
            temp_path = Path(temp_video.name)
        frame = extract_preview_frame(temp_path)

    return build_playground_preview_response(
        use_case_id=use_case_id,
        meta=meta,
        file_kind=file_kind,
        frame=frame,
        temp_path=temp_path,
        source_name=file.filename or "",
        preview_options={
            "fire_detection_mode": fire_detection_mode,
            "ppe_detection_mode": ppe_detection_mode,
            "speed_detection_class": speed_detection_class,
            "roi": _parse_preview_roi(roi_json),
        },
    )


@app.post("/api/playground-preview-sample", tags=["Inference"])
async def playground_preview_sample(
    sample_name: str = Form(...),
    use_case_id: str = Form(...),
    fire_detection_mode: str | None = Form(None),
    ppe_detection_mode: str | None = Form(None),
    speed_detection_class: str | None = Form(None),
    roi_json: str | None = Form(None),
) -> dict[str, object]:
    meta = get_metadata(use_case_id)
    if meta is None:
        raise HTTPException(status_code=404, detail=f"Unknown use case: {use_case_id}")

    sample_basename = Path(sample_name).name
    candidate_paths = [
        SAMPLE_IMAGES_DIR / sample_basename,
        STATIC_SAMPLE_DIR / sample_basename,
        STATIC_DIR / sample_basename,
        BASE_DIR / sample_basename,
    ]
    sample_path = next((p for p in candidate_paths if p.exists()), None)
    if sample_path is None:
        raise HTTPException(status_code=404, detail=f"Sample file not found: {sample_basename}")

    file_kind = detect_path_kind(sample_path)
    temp_path: Path | None = None

    if file_kind == "image":
        frame = cv2.imread(str(sample_path))
        if frame is None:
            raise HTTPException(status_code=400, detail="Unable to load sample image.")
    else:
        with tempfile.NamedTemporaryFile(delete=False, suffix=sample_path.suffix or ".mp4") as temp_video:
            shutil.copyfile(sample_path, temp_video.name)
            temp_path = Path(temp_video.name)
        frame = extract_preview_frame(temp_path)

    return build_playground_preview_response(
        use_case_id=use_case_id,
        meta=meta,
        file_kind=file_kind,
        frame=frame,
        temp_path=temp_path,
        source_name=sample_path.name,
        preview_options={
            "fire_detection_mode": fire_detection_mode,
            "ppe_detection_mode": ppe_detection_mode,
            "speed_detection_class": speed_detection_class,
            "roi": _parse_preview_roi(roi_json),
        },
    )


# ── Video Analysis (legacy PPE endpoint — kept for backward compat) ──────

@app.post("/api/analyze-video", tags=["Video Analysis"], response_model=VideoJobResponse)
async def analyze_video(payload: AnalyzeVideoRequest) -> VideoJobResponse:
    if not payload.filename.strip():
        raise HTTPException(status_code=400, detail="Filename is required.")

    ensure_mock_video()
    sync_static_assets()
    await asyncio.sleep(0.5)

    selected_asset = STATIC_DIR / payload.filename
    if not selected_asset.exists():
        raise HTTPException(status_code=404, detail=f"Video file not found: {payload.filename}")

    job = create_job(
        use_case="PPE Detection",
        use_case_id="ppe-detection",
        filename=payload.filename,
        status="processing_started",
        result_url="",
        message="Video queued and processing has started.",
        estimated_time="15 minutes",
    )

    output_name = f"{Path(payload.filename).stem}_ppe.mp4"
    output_path = PROCESSED_DIR / output_name
    model_path = str(BEST_MODEL_PATH) if BEST_MODEL_PATH.exists() else str(LOCAL_FALLBACK_MODEL_PATH)

    try:
        result = await asyncio.to_thread(
            ppe_process_video,
            input_path=str(selected_asset),
            output_path=str(output_path),
            model_path=model_path,
            ppe_model_path=ppe_engine.resolve_ppe_model_path(),
            device=auto_device(),
            show=False,
        )
        actual_output = _resolve_completed_output_path(output_path, result)

        metrics = result.get("metrics", {}) if isinstance(result, dict) else {}
        analytics_rows = _persist_use_case_analytics(
            use_case_id="ppe-detection",
            result=result,
            filename=payload.filename,
            job_id=int(job["id"]),
            output_video_link=f"/static/processed/{actual_output.name}",
            run_status="completed",
        )
        if analytics_rows is not None:
            metrics = {
                **metrics,
                "analytics_input_id": analytics_rows["input_row"]["input_id"],
                "analytics_output_rows": len(analytics_rows["output_rows"]),
            }

        completed_job = update_job(
            job["id"],
            status="completed",
            result_url=f"/static/processed/{actual_output.name}",
            message="Video analysis completed successfully.",
            metrics=metrics,
        )
        return VideoJobResponse(**completed_job, output_url=f"/static/processed/{actual_output.name}")
    except Exception as error:
        failed_job = update_job(
            job["id"],
            status="failed",
            result_url="",
            message=f"Video analysis failed: {error}",
        )
        raise HTTPException(status_code=500, detail=failed_job["message"]) from error


# ── Generic Use Case Video Analysis ──────────────────────────────────────

@app.post("/api/analyze-use-case", tags=["Use Cases"], response_model=VideoJobResponse)
async def analyze_use_case(payload: AnalyzeUseCaseRequest) -> VideoJobResponse:
    """
    Generic endpoint: analyze a video for ANY registered use case.
    Accepts use_case_id (e.g. 'fire-smoke-detection') and filename.
    """
    if not payload.filename.strip():
        raise HTTPException(status_code=400, detail="Filename is required.")
    if not payload.use_case_id.strip():
        raise HTTPException(status_code=400, detail="use_case_id is required.")
    canonical_requested_use_case_id = INTEGRATION_USE_CASE_ALIASES.get(
        payload.use_case_id.strip().lower(),
        payload.use_case_id.strip(),
    )

    # Validate use case exists
    meta = get_metadata(canonical_requested_use_case_id)
    if meta is None:
        raise HTTPException(status_code=404, detail=f"Unknown use case: {payload.use_case_id}")

    # PPE also flows through the generic pipeline now
    # (legacy /api/analyze-video kept for backward compat)

    # Get processor
    processor = get_processor(canonical_requested_use_case_id)
    if processor is None:
        raise HTTPException(status_code=500, detail=f"Processor not available for: {payload.use_case_id}")

    # Ensure assets are synced
    sync_static_assets()

    # Find the video file
    selected_asset = STATIC_DIR / payload.filename
    if not selected_asset.exists():
        # Also check root BackEnd directory
        alt_asset = BASE_DIR / payload.filename
        if alt_asset.exists():
            shutil.copyfile(alt_asset, selected_asset)
        else:
            raise HTTPException(status_code=404, detail=f"Video file not found: {payload.filename}")

    # Create job
    job = create_job(
        use_case=meta["title"],
        use_case_id=canonical_requested_use_case_id,
        filename=payload.filename,
        status="processing_started",
        result_url="",
        message=f"{meta['title']} analysis started.",
        estimated_time="10 minutes",
    )

    # Determine output path
    suffix = canonical_requested_use_case_id.replace("-", "_")
    output_name = f"{Path(payload.filename).stem}_{suffix}.mp4"
    output_path = PROCESSED_DIR / output_name
    model_path = str(BEST_MODEL_PATH) if BEST_MODEL_PATH.exists() else str(LOCAL_FALLBACK_MODEL_PATH)

    try:
        result = await asyncio.to_thread(
            processor,
            input_path=str(selected_asset),
            output_path=str(output_path),
            model_path=model_path,
            device=auto_device(),
            show=False,
        )
        actual_output = _resolve_completed_output_path(output_path, result)

        metrics = result.get("metrics", {}) if isinstance(result, dict) else {}
        normalized_use_case_id = (
            _normalize_integration_use_case_id(canonical_requested_use_case_id)
            if canonical_requested_use_case_id in INTEGRATION_SUPPORTED_USE_CASES or canonical_requested_use_case_id in INTEGRATION_USE_CASE_ALIASES
            else canonical_requested_use_case_id
        )
        if normalized_use_case_id in INTEGRATION_SUPPORTED_USE_CASES:
            analytics_rows = _persist_use_case_analytics(
                use_case_id=normalized_use_case_id,
                result=result,
                filename=payload.filename,
                job_id=int(job["id"]),
                output_video_link=f"/static/processed/{actual_output.name}",
                run_status="completed",
            )
            if analytics_rows is not None:
                metrics = {
                    **metrics,
                    "analytics_input_id": analytics_rows["input_row"]["input_id"],
                    "analytics_output_rows": len(analytics_rows["output_rows"]),
                }

        completed_job = update_job(
            job["id"],
            status="completed",
            result_url=f"/static/processed/{actual_output.name}",
            message=f"{meta['title']} analysis completed successfully.",
            metrics=metrics,
        )
        return VideoJobResponse(**completed_job, output_url=f"/static/processed/{actual_output.name}")

    except Exception as error:
        failed_job = update_job(
            job["id"],
            status="failed",
            result_url="",
            message=f"{meta['title']} analysis failed: {error}",
        )
        raise HTTPException(status_code=500, detail=failed_job["message"]) from error


# ── Jobs History ─────────────────────────────────────────────────────────

@app.get("/api/jobs", tags=["Jobs"], response_model=list[VideoJobResponse])
def get_jobs(use_case_id: str | None = None) -> list[VideoJobResponse]:
    """List analysis jobs. Optionally filter by use_case_id."""
    jobs = list_jobs(use_case_id=use_case_id)
    return [VideoJobResponse(**job, output_url=job.get("result_url")) for job in jobs]


@app.get("/api/jobs/{job_id}", tags=["Jobs"], response_model=VideoJobResponse)
def get_job_by_id(job_id: int) -> VideoJobResponse:
    """Get a single job by ID — useful for status polling."""
    job = get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")
    return VideoJobResponse(**job, output_url=job.get("result_url"))


# ── Integration: MinIO PPE Demo ─────────────────────────────────────────

@app.get(
    "/api/integrations/minio/status",
    tags=["Integration"],
    response_model=MinioIntegrationOverviewResponse,
)
def get_minio_integration_status(use_case_id: str = INTEGRATION_USE_CASE_ID) -> MinioIntegrationOverviewResponse:
    canonical_use_case_id = _normalize_integration_use_case_id(use_case_id)
    return _build_integration_overview(use_case_id=canonical_use_case_id)


@app.get(
    "/api/integrations/model-state/{use_case_id}",
    tags=["Integration"],
    response_model=IntegrationModelStateResponse,
)
def get_integration_model_state_endpoint(use_case_id: str) -> IntegrationModelStateResponse:
    canonical_use_case_id = _normalize_integration_use_case_id(use_case_id)
    return IntegrationModelStateResponse(**get_integration_model_state(canonical_use_case_id))


@app.post(
    "/api/integrations/minio/connect",
    tags=["Integration"],
    response_model=MinioIntegrationOverviewResponse,
)
def connect_minio_integration(payload: MinioConnectRequest) -> MinioIntegrationOverviewResponse:
    canonical_use_case_id = _normalize_integration_use_case_id(payload.use_case_id)
    processing_mode = _normalize_processing_mode(payload.processing_mode)
    selected_model_mode = normalize_model_mode(payload.model_mode)
    selected_model_version_id = str(payload.model_version_id or "").strip() or None
    model_resolution = resolve_inference_model_path(
        canonical_use_case_id,
        model_mode=selected_model_mode,
        model_version_id=selected_model_version_id,
    )
    snapshot = _get_integration_state(canonical_use_case_id)
    zone_points_normalized = None
    rule_config = None
    if canonical_use_case_id == "region-alerts":
        zone_points_normalized = (
            _normalize_zone_points_normalized(payload.zone_points_normalized)
            if _payload_field_provided(payload, "zone_points_normalized")
            else snapshot.get("zone_points_normalized")
        )
        rule_config = (
            _normalize_region_alert_rule_config(payload.rule_config)
            if _payload_field_provided(payload, "rule_config")
            else snapshot.get("rule_config")
        )
    config, credential_mode, bucket_created = _resolve_minio_connection(payload)
    connected_at = _utc_now_iso()
    use_case_title = _get_integration_use_case_title(canonical_use_case_id)
    base_message = (
        f"Connected to MinIO successfully for {use_case_title}."
        if credential_mode == "direct"
        else f"Connected to local demo MinIO for {use_case_title}. UI credentials were accepted for the demo flow."
    )
    message = (
        f"{base_message} Bucket '{config.bucket}' was created automatically."
        if bucket_created
        else base_message
    )

    _set_integration_state(
        canonical_use_case_id,
        connected=True,
        processing=False,
        message=message,
        last_sync_at=None,
        connected_at=connected_at,
        credential_mode=credential_mode,
        processing_mode=processing_mode,
        model_mode=selected_model_mode,
        model_version_id=selected_model_version_id,
        model_mode_used=model_resolution["model_mode_used"],
        model_path_used=model_resolution["display_model_path"],
        fallback_used=bool(model_resolution["fallback_used"]),
        fallback_reason=model_resolution["fallback_reason"],
        connection=config,
        zone_points_normalized=zone_points_normalized,
        rule_config=rule_config,
    )

    if processing_mode == "auto":
        _start_integration_processing(canonical_use_case_id)
    else:
        _set_integration_state(
            canonical_use_case_id,
            pending_rescan=False,
            processing=False,
            message=f"Manual mode is ready. Fetch videos from the MinIO input prefix and queue selected {use_case_title} inputs for processing.",
        )
    return _build_integration_overview(use_case_id=canonical_use_case_id)


@app.get(
    "/api/integrations/minio/input-videos",
    tags=["Integration"],
    response_model=MinioInputVideoListResponse,
)
def list_minio_input_videos(
    use_case_id: str = INTEGRATION_USE_CASE_ID,
    limit: int = 10,
) -> MinioInputVideoListResponse:
    canonical_use_case_id = _normalize_integration_use_case_id(use_case_id)
    safe_limit = max(1, min(int(limit), 100))
    videos, total_available = _build_manual_input_video_items(
        use_case_id=canonical_use_case_id,
        limit=safe_limit,
    )
    return MinioInputVideoListResponse(
        use_case_id=canonical_use_case_id,
        fetched_count=len(videos),
        total_available=total_available,
        videos=videos,
    )


@app.post(
    "/api/integrations/minio/process-selected",
    tags=["Integration"],
    response_model=MinioProcessSelectedResponse,
)
def process_selected_minio_videos(payload: MinioProcessSelectedRequest) -> MinioProcessSelectedResponse:
    canonical_use_case_id = _normalize_integration_use_case_id(payload.use_case_id)
    snapshot = _get_integration_state(canonical_use_case_id)
    zone_points_normalized = None
    rule_config = None
    if canonical_use_case_id == "region-alerts":
        zone_points_normalized = (
            _normalize_zone_points_normalized(payload.zone_points_normalized)
            if _payload_field_provided(payload, "zone_points_normalized")
            else snapshot.get("zone_points_normalized")
        )
        rule_config = (
            _normalize_region_alert_rule_config(payload.rule_config)
            if _payload_field_provided(payload, "rule_config")
            else snapshot.get("rule_config")
        )
    config = snapshot.get("connection")

    if not snapshot.get("connected") or config is None:
        raise HTTPException(status_code=400, detail="Connect to MinIO before processing videos.")

    requested_keys = [str(key).strip() for key in payload.object_keys if str(key).strip()]
    if not requested_keys:
        raise HTTPException(status_code=400, detail="Select at least one input video to process.")

    unique_keys = list(dict.fromkeys(requested_keys))

    try:
        client = create_client(config)
        validate_bucket_access(client, config.bucket)
    except Exception as error:
        raise HTTPException(status_code=400, detail=f"Unable to access the configured MinIO bucket: {error}") from error

    selected_model_mode = normalize_model_mode(payload.model_mode)
    selected_model_version_id = str(payload.model_version_id or "").strip() or None
    model_resolution = resolve_inference_model_path(
        canonical_use_case_id,
        model_mode=selected_model_mode,
        model_version_id=selected_model_version_id,
    )
    if canonical_use_case_id == "region-alerts":
        _set_integration_state(
            canonical_use_case_id,
            zone_points_normalized=zone_points_normalized,
            rule_config=rule_config,
        )

    queued_count = 0
    skipped_count = 0
    use_case_title = _get_integration_use_case_title(canonical_use_case_id)

    for input_key in unique_keys:
        normalized_input_prefix = normalize_prefix(config.input_prefix, "")
        if normalized_input_prefix and not input_key.startswith(normalized_input_prefix):
            skipped_count += 1
            continue
        if not object_exists(client, config.bucket, input_key):
            skipped_count += 1
            continue

        output_key = build_output_object_key(
            input_key,
            config.input_prefix,
            config.output_prefix,
            use_case_suffix=_get_integration_output_suffix(canonical_use_case_id),
        )
        existing_run = get_integration_run(
            provider=INTEGRATION_PROVIDER,
            use_case_id=canonical_use_case_id,
            bucket=config.bucket,
            input_key=input_key,
        )
        has_output = object_exists(client, config.bucket, output_key)
        needs_refresh = _integration_output_needs_refresh(
            canonical_use_case_id,
            existing_run,
            has_output=has_output,
        )
        existing_status = str(existing_run["status"]) if existing_run else ""
        if existing_status == "processing":
            skipped_count += 1
            continue
        if has_output and not needs_refresh:
            skipped_count += 1
            continue
        if existing_status == "completed" and not needs_refresh:
            skipped_count += 1
            continue

        upsert_integration_run(
            provider=INTEGRATION_PROVIDER,
            use_case_id=canonical_use_case_id,
            bucket=config.bucket,
            input_key=input_key,
            output_key=output_key,
            status="queued",
            message=f"Queued for manual {use_case_title} processing from MinIO input.",
            metrics={
                **(existing_run.get("metrics", {}) if existing_run else {}),
                "requested_model_mode": selected_model_mode,
                "requested_model_version_id": selected_model_version_id,
                "model_mode_used": model_resolution["model_mode_used"],
                "model_path_used": model_resolution["display_model_path"],
                "fallback_used": bool(model_resolution["fallback_used"]),
                "fallback_reason": model_resolution["fallback_reason"],
            },
        )
        queued_count += 1

    if queued_count > 0:
        _set_integration_state(
            canonical_use_case_id,
            processing=True,
            pending_rescan=False,
            message=f"Queued {queued_count} {use_case_title} video{'s' if queued_count != 1 else ''} for processing.",
        )
        _start_integration_processing(canonical_use_case_id)
    else:
        _set_integration_state(
            canonical_use_case_id,
            processing=False,
            message="No new videos were queued. Completed or currently processing videos were skipped.",
        )

    overview = _build_integration_overview(use_case_id=canonical_use_case_id)
    message = (
        f"Queued {queued_count} video{'s' if queued_count != 1 else ''} for {use_case_title}."
        if queued_count > 0
        else "Nothing was queued. The selected videos were already completed, in progress, or unavailable."
    )
    return MinioProcessSelectedResponse(
        queued_count=queued_count,
        skipped_count=skipped_count,
        message=message,
        model_mode_used=str(model_resolution["model_mode_used"]),
        model_path_used=str(model_resolution["display_model_path"]),
        fallback_used=bool(model_resolution["fallback_used"]),
        fallback_reason=model_resolution["fallback_reason"],
        overview=overview,
    )


@app.get("/api/integrations/minio/object", tags=["Integration"])
def stream_minio_integration_object(request: Request, use_case_id: str, object_key: str):
    canonical_use_case_id = _normalize_integration_use_case_id(use_case_id)
    snapshot = _get_integration_state(canonical_use_case_id)
    config = snapshot.get("connection")
    if not snapshot.get("connected") or config is None:
        raise HTTPException(status_code=400, detail="Connect to MinIO before requesting videos.")

    try:
        client = create_client(config)
        validate_bucket_access(client, config.bucket)
        stat = client.stat_object(config.bucket, object_key)
    except Exception as error:
        raise HTTPException(status_code=404, detail=f"Unable to locate MinIO object: {error}") from error

    total_size = int(getattr(stat, "size", 0) or 0)
    range_header = request.headers.get("range")
    start = 0
    end = max(total_size - 1, 0)
    status_code = 200

    if range_header and total_size > 0:
        try:
            start, end = _parse_http_byte_range(range_header, total_size)
            status_code = 206
        except Exception as error:
            raise HTTPException(status_code=416, detail=f"Invalid range request: {error}") from error

    length = max(end - start + 1, 0)

    try:
        response = client.get_object(config.bucket, object_key, offset=start, length=length if total_size > 0 else None)
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Unable to read MinIO object: {error}") from error

    def iter_chunks():
        try:
            for chunk in response.stream(1024 * 1024):
                yield chunk
        finally:
            response.close()
            response.release_conn()

    content_type = getattr(stat, "content_type", None) or mimetypes.guess_type(object_key)[0] or "application/octet-stream"
    filename = Path(object_key).name or "output"

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Type": content_type,
        "Content-Disposition": f'inline; filename="{filename}"',
        "Cache-Control": "no-store",
    }
    if total_size > 0:
        headers["Content-Length"] = str(length if status_code == 206 else total_size)
    if status_code == 206:
        headers["Content-Range"] = f"bytes {start}-{end}/{total_size}"

    return StreamingResponse(iter_chunks(), status_code=status_code, headers=headers, media_type=content_type)


@app.post(
    "/api/integrations/minio/upload",
    tags=["Integration"],
    response_model=MinioUploadResponse,
)
async def upload_minio_integration_videos(
    files: list[UploadFile] | None = File(None),
    file: UploadFile | None = File(None),
    use_case_id: str | None = Form(None),
) -> MinioUploadResponse:
    canonical_use_case_id = _resolve_upload_use_case_id(use_case_id)
    snapshot = _get_integration_state(canonical_use_case_id)
    config = snapshot.get("connection")

    if not snapshot.get("connected") or config is None:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Connect to MinIO before uploading videos for {_get_integration_use_case_title(canonical_use_case_id)}."
            ),
        )

    upload_files = [uploaded for uploaded in (files or []) if uploaded is not None]
    if file is not None:
        upload_files.append(file)

    if not upload_files:
        raise HTTPException(status_code=400, detail="At least one video file is required.")

    try:
        client = create_client(config)
        validate_bucket_access(client, config.bucket)
    except Exception as error:
        raise HTTPException(status_code=400, detail=f"Unable to access the configured MinIO bucket: {error}") from error

    uploaded_items: list[MinioUploadItem] = []

    for uploaded_file in upload_files:
        if not uploaded_file.filename:
            continue

        ext = Path(uploaded_file.filename).suffix.lower()
        if ext not in ALLOWED_VIDEO_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type '{ext}' for '{uploaded_file.filename}'. Allowed: {', '.join(sorted(ALLOWED_VIDEO_EXTENSIONS))}",
            )

        object_key, output_key = _build_unique_input_object_key(
            client,
            config,
            uploaded_file.filename,
            use_case_id=canonical_use_case_id,
        )
        contents = await uploaded_file.read()
        if not contents:
            raise HTTPException(status_code=400, detail=f"Uploaded file '{uploaded_file.filename}' is empty.")

        data_stream = io.BytesIO(contents)
        client.put_object(
            config.bucket,
            object_key,
            data_stream,
            length=len(contents),
            content_type=uploaded_file.content_type or "video/mp4",
        )

        upsert_integration_run(
            provider=INTEGRATION_PROVIDER,
            use_case_id=canonical_use_case_id,
            bucket=config.bucket,
            input_key=object_key,
            output_key=output_key,
            status="queued",
            message=f"Video uploaded to the MinIO input prefix and queued for {_get_integration_use_case_title(canonical_use_case_id)} processing.",
            metrics={},
        )
        uploaded_items.append(
            MinioUploadItem(
                filename=Path(uploaded_file.filename).name,
                object_key=object_key,
                output_key=output_key,
                status="queued",
                message="Uploaded to MinIO input prefix.",
            )
        )

    if not uploaded_items:
        raise HTTPException(status_code=400, detail="No uploadable video files were received.")

    _set_integration_state(
        canonical_use_case_id,
        message=f"{len(uploaded_items)} video(s) uploaded to the MinIO input prefix.",
        last_sync_at=_utc_now_iso(),
    )
    _start_integration_processing(canonical_use_case_id)

    return MinioUploadResponse(
        uploaded_files=uploaded_items,
        accepted_count=len(uploaded_items),
        queued_count=len(uploaded_items),
        overview=_build_integration_overview(use_case_id=canonical_use_case_id),
    )


# ── Video Upload ─────────────────────────────────────────────────────────

ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".webm"}


@app.post("/api/upload-video", tags=["Video Upload"])
async def upload_video(file: UploadFile = File(...)) -> dict[str, str]:
    """Upload a video file to the static directory for analysis."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required.")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(ALLOWED_VIDEO_EXTENSIONS)}",
        )

    # Sanitise filename — keep original name, avoid path traversal
    safe_name = Path(file.filename).name
    target = STATIC_DIR / safe_name

    contents = await file.read()
    target.write_bytes(contents)

    return {
        "status": "uploaded",
        "filename": safe_name,
        "size_bytes": len(contents),
        "url": f"/static/{safe_name}",
    }


# ── List Available Videos ────────────────────────────────────────────────

@app.get("/api/list-videos", tags=["Video Upload"])
def list_videos() -> list[dict[str, str]]:
    """Return all video files available in the static directory."""
    videos = []
    for ext in ALLOWED_VIDEO_EXTENSIONS:
        for p in STATIC_DIR.glob(f"*{ext}"):
            if p.is_file() and not p.name.startswith("."):
                videos.append({
                    "filename": p.name,
                    "url": f"/static/{p.name}",
                    "size_bytes": str(p.stat().st_size),
                })
    # Also check backEnd root for asset files
    for filename in STATIC_ASSET_FILES:
        source = BASE_DIR / filename
        if source.exists() and Path(filename).suffix.lower() in ALLOWED_VIDEO_EXTENSIONS:
            target = STATIC_DIR / filename
            if not target.exists():
                shutil.copyfile(source, target)
            if not any(v["filename"] == filename for v in videos):
                videos.append({
                    "filename": filename,
                    "url": f"/static/{filename}",
                    "size_bytes": str(source.stat().st_size),
                })
    return sorted(videos, key=lambda v: v["filename"])


# ── Video Preview Frame ──────────────────────────────────────────────────

@app.get("/api/video-preview/{filename}", tags=["Video"])
def get_video_preview(filename: str) -> Response:
    """Extract a single frame from a video and return it as JPEG."""
    # Check static dir first, then root BackEnd dir
    video_path = STATIC_DIR / filename
    if not video_path.exists():
        video_path = BASE_DIR / filename
    if not video_path.exists():
        raise HTTPException(status_code=404, detail=f"Video file not found: {filename}")

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise HTTPException(status_code=500, detail=f"Cannot open video: {filename}")

    # Seek to 10% of the video for a meaningful thumbnail
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if total_frames > 10:
        cap.set(cv2.CAP_PROP_POS_FRAMES, total_frames // 10)

    ok, frame = cap.read()
    cap.release()

    if not ok or frame is None:
        raise HTTPException(status_code=500, detail="Failed to extract frame.")

    # Resize to a reasonable thumbnail size
    h, w = frame.shape[:2]
    max_w = 640
    if w > max_w:
        scale = max_w / w
        frame = cv2.resize(frame, (max_w, int(h * scale)))

    success, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
    if not success:
        raise HTTPException(status_code=500, detail="Failed to encode preview frame.")

    return Response(
        content=buffer.tobytes(),
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=3600"},
    )
def _resolve_completed_output_path(expected_output: Path, result: Any) -> Path:
    actual_output = expected_output
    if not actual_output.exists():
        fallback_output = Path(str(result.get("output_video", ""))) if isinstance(result, dict) else None
        if fallback_output and fallback_output.exists():
            actual_output = fallback_output
    if actual_output.suffix.lower() in INTEGRATION_IMAGE_EXTENSIONS:
        if not actual_output.exists() or actual_output.stat().st_size <= 0:
            raise RuntimeError(f"Integration output artifact is missing or empty: {actual_output}")
        return actual_output
    validate_output_video(str(actual_output))
    ensure_browser_playable_mp4(str(actual_output))
    validate_output_video(str(actual_output))
    return actual_output
