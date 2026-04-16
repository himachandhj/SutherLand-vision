import asyncio
import base64
import hashlib
import io
import tempfile
import shutil
import threading
import time
from pathlib import Path
from typing import Any
from urllib.parse import quote
from uuid import uuid4

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from ultralytics import YOLO

from app.core.config import settings
from app.core.database import (
    create_job,
    get_integration_run,
    get_job,
    init_db,
    list_integration_runs,
    list_jobs,
    replace_fire_detection_outputs,
    replace_ppe_detection_outputs,
    replace_region_alert_outputs,
    upsert_fire_detection_input,
    update_integration_run,
    update_job,
    upsert_integration_run,
    upsert_ppe_detection_input,
    upsert_region_alert_input,
)
from app.core.minio_integration import (
    MinioConnectionConfig,
    build_output_object_key,
    build_presigned_get_url,
    create_client,
    list_video_objects,
    normalize_endpoint,
    normalize_prefix,
    object_exists,
    validate_bucket_access,
)
from app.schemas.job import UseCaseInfo, VideoJobResponse
from app.schemas.integration import (
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
import ppe_detection as ppe_engine
from ppe_detection import auto_device, process_video as ppe_process_video
from use_cases.base import ensure_browser_playable_mp4, validate_output_video
from use_cases.fire_smoke import detect_fire_smoke_hsv
from use_cases.registry import USE_CASE_REGISTRY, get_processor, get_metadata, list_use_cases
from use_cases.speed_estimation import process_video as speed_process_video
from use_cases.zone_intrusion import create_default_zone, point_in_polygon

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
PPE_PREVIEW_PERSON_MODEL: YOLO | None = None
PPE_PREVIEW_MODEL_SOURCE = ""
PPE_PREVIEW_DETECTOR: ppe_engine.PPEDetector | None = None
INTEGRATION_PROVIDER = "minio"
INTEGRATION_USE_CASE_ID = "ppe-detection"
INTEGRATION_SUPPORTED_USE_CASES = {
    "ppe-detection",
    "region-alerts",
    "fire-detection",
}
INTEGRATION_USE_CASE_ALIASES = {
    "region-alert": "region-alerts",
}
INTEGRATION_USE_CASE_PREFIXES = {
    "ppe-detection": ("ppe/input/", "ppe/output/"),
    "region-alerts": ("region/input/", "region/output/"),
    "fire-detection": ("fire/input/", "fire/output/"),
}
INTEGRATION_USE_CASE_OUTPUT_SUFFIXES = {
    "ppe-detection": "ppe_detection",
    "region-alerts": "region_alert",
    "fire-detection": "fire_detection",
}
INTEGRATION_OVERVIEW_LIMIT = 5
INTEGRATION_STATE_LOCK = threading.Lock()
INTEGRATION_THREADS: dict[str, threading.Thread | None] = {}
INTEGRATION_STATES: dict[str, dict[str, Any]] = {}


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

    ppe_model_path = str(BASE_DIR / "ppe.pt") if (BASE_DIR / "ppe.pt").exists() else None
    ppe_model, ppe_names = ppe_engine.load_ppe_model(ppe_model_path)
    PPE_PREVIEW_DETECTOR = ppe_engine.PPEDetector(
        ppe_model=ppe_model,
        ppe_names=ppe_names,
        ppe_conf=0.30,
        device=auto_device(),
    )


def resolve_default_model_path() -> str:
    if BEST_MODEL_PATH.exists():
        return str(BEST_MODEL_PATH)
    if LOCAL_FALLBACK_MODEL_PATH.exists():
        return str(LOCAL_FALLBACK_MODEL_PATH)
    return FALLBACK_MODEL_NAME


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
        "message": "",
        "last_sync_at": None,
        "connected_at": None,
        "credential_mode": "direct",
        "connection": None,
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


def _build_connection_details(
    config: MinioConnectionConfig,
    *,
    use_case_id: str,
    connected_at: str | None,
    credential_mode: str,
    processing_mode: str,
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
        connected_at=connected_at,
    )


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
        ) if config else None,
    )

    if not overview.connected or config is None:
        return overview

    try:
        client = create_client(config)
        validate_bucket_access(client, config.bucket)
        input_objects = list_video_objects(client, config.bucket, config.input_prefix)
        output_objects = list_video_objects(client, config.bucket, config.output_prefix)
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
        raise HTTPException(status_code=400, detail="Connect to MinIO before fetching input videos.")

    try:
        client = create_client(config)
        validate_bucket_access(client, config.bucket)
        input_objects = list_video_objects(client, config.bucket, config.input_prefix)
        all_runs = list_integration_runs(
            limit=500,
            provider=INTEGRATION_PROVIDER,
            use_case_id=canonical_use_case_id,
            bucket=config.bucket,
        )
    except Exception as error:
        raise HTTPException(status_code=400, detail=f"Unable to load MinIO input videos: {error}") from error

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
        if run:
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

    model_path = resolve_default_model_path()
    found_any_inputs = False

    try:
        while True:
            snapshot = _get_integration_state(canonical_use_case_id)
            current_mode = str(snapshot.get("processing_mode") or "manual")

            try:
                input_objects = list_video_objects(client, config.bucket, config.input_prefix)
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

                if object_exists(client, config.bucket, output_key):
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
                    if existing_status in {"completed", "failed", "processing"}:
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

                    result = processor(
                        input_path=str(local_input),
                        output_path=str(local_output),
                        model_path=model_path,
                        device=auto_device(),
                        show=False,
                    )

                    actual_output = _resolve_completed_output_path(local_output, result)

                    client.fput_object(config.bucket, next_output_key, str(actual_output), content_type="video/mp4")
                    metrics = result.get("metrics", {}) if isinstance(result, dict) else {}
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
                        metrics = {
                            **metrics,
                            "analytics_input_id": analytics_rows["input_row"]["input_id"],
                            "analytics_output_rows": len(analytics_rows["output_rows"]),
                        }
                    update_integration_run(
                        int(run["id"]),
                        status="completed",
                        output_key=next_output_key,
                        message=f"{use_case_title} video processed and uploaded to the MinIO output prefix.",
                        metrics=metrics,
                    )
            except Exception as error:
                update_integration_run(
                    int(run["id"]),
                    status="failed",
                    output_key=next_output_key,
                    message=f"{use_case_title} processing failed: {error}",
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
    load_ppe_preview_components()


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


def run_ppe_preview(frame: np.ndarray) -> tuple[np.ndarray, list[dict[str, str | float]]]:
    if PPE_PREVIEW_PERSON_MODEL is None or PPE_PREVIEW_DETECTOR is None:
        raise HTTPException(
            status_code=503,
            detail="PPE preview model is not available. Add yolov8n.pt/best.pt and optional ppe.pt in BackEnd.",
        )

    annotated = frame.copy()
    fh, fw = frame.shape[:2]

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
        worker = ppe_engine.WorkerState(tid, window=1)
        worker.update(1, ppe_list[index])
        ppe_engine.draw_person(annotated, bbox, worker, lw=2)

        status = ppe_list[index]
        x1, y1, x2, y2 = map(int, bbox.tolist())
        detections.append(
            {
                "class": f"person #{tid}",
                "confidence": 1.0,
                "bbox": [x1, y1, x2, y2],
                "helmet": status["helmet"],
                "vest": status["vest"],
                "shoes": status["shoes"],
            }
        )

    return annotated, detections


def run_region_alerts_preview(frame: np.ndarray) -> tuple[np.ndarray, list[dict[str, str | float]]]:
    annotated = frame.copy()
    fh, fw = annotated.shape[:2]
    zone = create_default_zone(fw, fh)

    overlay = annotated.copy()
    cv2.fillPoly(overlay, [zone], (0, 0, 80))
    cv2.addWeighted(overlay, 0.25, annotated, 0.75, 0, annotated)
    cv2.polylines(annotated, [zone], True, (0, 50, 230), 2, cv2.LINE_AA)
    cv2.putText(annotated, "RESTRICTED ZONE", (zone[0][0] + 10, zone[0][1] + 25),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 50, 230), 2, cv2.LINE_AA)

    if YOLO_MODEL is None:
        raise HTTPException(status_code=503, detail="YOLO model is not available for region alerts preview.")

    results = YOLO_MODEL(frame, conf=0.25, verbose=False)
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


def run_fire_detection_preview(frame: np.ndarray) -> tuple[np.ndarray, list[dict[str, str | float]]]:
    annotated = frame.copy()
    fire_regions, smoke_regions = detect_fire_smoke_hsv(frame)
    detections: list[dict[str, str | float]] = []

    for region in fire_regions:
        x1, y1, x2, y2 = region["bbox"]
        confidence = float(region["confidence"])
        cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 0, 255), 2)
        cv2.putText(annotated, f"FIRE {confidence:.0%}", (x1, max(20, y1 - 8)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2, cv2.LINE_AA)
        detections.append({
            "class": "fire",
            "confidence": round(confidence, 4),
        })

    for region in smoke_regions:
        x1, y1, x2, y2 = region["bbox"]
        confidence = float(region["confidence"])
        cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 140, 255), 2)
        cv2.putText(annotated, f"SMOKE {confidence:.0%}", (x1, max(20, y1 - 8)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 140, 255), 2, cv2.LINE_AA)
        detections.append({
            "class": "smoke",
            "confidence": round(confidence, 4),
        })

    return annotated, detections


def run_speed_estimation_preview(video_path: Path) -> tuple[np.ndarray, list[dict[str, str | float]]]:
    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as temp_output:
        output_path = Path(temp_output.name)

    model_path = str(BEST_MODEL_PATH) if BEST_MODEL_PATH.exists() else str(LOCAL_FALLBACK_MODEL_PATH)

    try:
        result = speed_process_video(
            input_path=str(video_path),
            output_path=str(output_path),
            model_path=model_path,
            device=auto_device(),
            show=False,
        )
        preview_frame = extract_preview_frame(output_path)
        metrics = result.get("metrics", {}) if isinstance(result, dict) else {}
        detections = [
            {"class": "vehicles scanned", "confidence": float(metrics.get("total_vehicles", 0))},
            {"class": "avg speed km/h", "confidence": float(metrics.get("avg_speed_kmh", 0))},
            {"class": "max speed km/h", "confidence": float(metrics.get("max_speed_kmh", 0))},
            {"class": "speeding violations", "confidence": float(metrics.get("speeding_violations", 0))},
        ]
        return preview_frame, detections
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
) -> dict[str, object]:
    try:
        if use_case_id == "ppe-detection":
            annotated_image, detections = run_ppe_preview(frame)
            model_source = PPE_PREVIEW_MODEL_SOURCE
        elif use_case_id == "object-counting":
            annotated_image, detections = run_object_counting_preview(frame)
            model_source = YOLO_MODEL_SOURCE
        elif use_case_id == "class-wise-object-counting":
            annotated_image, detections = run_classwise_counting_preview(frame)
            model_source = YOLO_MODEL_SOURCE
        elif use_case_id == "region-alerts":
            annotated_image, detections = run_region_alerts_preview(frame)
            model_source = YOLO_MODEL_SOURCE
        elif use_case_id == "fire-detection":
            annotated_image, detections = run_fire_detection_preview(frame)
            model_source = "fire-smoke-hsv-preview"
        elif use_case_id == "speed-estimation":
            if file_kind != "video" or temp_path is None:
                raise HTTPException(
                    status_code=400,
                    detail="Speed Estimation playground preview requires a video upload.",
                )
            annotated_image, detections = run_speed_estimation_preview(temp_path)
            model_source = "use_cases.speed_estimation"
        else:
            annotated_image, detections = run_yolo_inference(frame)
            model_source = YOLO_MODEL_SOURCE
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)

    return {
        "status": "success",
        "use_case_id": use_case_id,
        "use_case_title": meta["title"],
        "file_kind": file_kind,
        "detections": detections,
        "image_base64": image_to_base64(annotated_image),
        "model_source": model_source,
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
    )


@app.post("/api/playground-preview-sample", tags=["Inference"])
async def playground_preview_sample(
    sample_name: str = Form(...),
    use_case_id: str = Form(...),
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
        temp_path = sample_path
        frame = extract_preview_frame(sample_path)

    return build_playground_preview_response(
        use_case_id=use_case_id,
        meta=meta,
        file_kind=file_kind,
        frame=frame,
        temp_path=temp_path,
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
            ppe_model_path=str(BASE_DIR / "ppe.pt") if (BASE_DIR / "ppe.pt").exists() else None,
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


@app.post(
    "/api/integrations/minio/connect",
    tags=["Integration"],
    response_model=MinioIntegrationOverviewResponse,
)
def connect_minio_integration(payload: MinioConnectRequest) -> MinioIntegrationOverviewResponse:
    canonical_use_case_id = _normalize_integration_use_case_id(payload.use_case_id)
    processing_mode = _normalize_processing_mode(payload.processing_mode)
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
        connection=config,
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
        existing_status = str(existing_run["status"]) if existing_run else ""
        if object_exists(client, config.bucket, output_key) or existing_status in {"completed", "processing"}:
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
            metrics=existing_run.get("metrics", {}) if existing_run else {},
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
            units, value = range_header.strip().split("=", 1)
            if units != "bytes":
                raise ValueError("Unsupported range unit")
            start_text, end_text = value.split("-", 1)
            if start_text:
                start = int(start_text)
            if end_text:
                end = int(end_text)
            else:
                end = total_size - 1
            start = max(0, min(start, total_size - 1))
            end = max(start, min(end, total_size - 1))
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

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Type": "video/mp4",
    }
    if total_size > 0:
        headers["Content-Length"] = str(length if status_code == 206 else total_size)
    if status_code == 206:
        headers["Content-Range"] = f"bytes {start}-{end}/{total_size}"

    return StreamingResponse(iter_chunks(), status_code=status_code, headers=headers, media_type="video/mp4")


@app.post(
    "/api/integrations/minio/upload",
    tags=["Integration"],
    response_model=MinioUploadResponse,
)
async def upload_minio_integration_videos(
    files: list[UploadFile] = File(...),
    use_case_id: str = Form(INTEGRATION_USE_CASE_ID),
) -> MinioUploadResponse:
    canonical_use_case_id = _normalize_integration_use_case_id(use_case_id)
    snapshot = _get_integration_state(canonical_use_case_id)
    config = snapshot.get("connection")

    if not snapshot.get("connected") or config is None:
        raise HTTPException(status_code=400, detail="Connect to MinIO before uploading videos.")

    if not files:
        raise HTTPException(status_code=400, detail="At least one video file is required.")

    try:
        client = create_client(config)
        validate_bucket_access(client, config.bucket)
    except Exception as error:
        raise HTTPException(status_code=400, detail=f"Unable to access the configured MinIO bucket: {error}") from error

    uploaded_items: list[MinioUploadItem] = []

    for file in files:
        if not file.filename:
            continue

        ext = Path(file.filename).suffix.lower()
        if ext not in ALLOWED_VIDEO_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type '{ext}' for '{file.filename}'. Allowed: {', '.join(sorted(ALLOWED_VIDEO_EXTENSIONS))}",
            )

        object_key, output_key = _build_unique_input_object_key(
            client,
            config,
            file.filename,
            use_case_id=canonical_use_case_id,
        )
        contents = await file.read()
        if not contents:
            raise HTTPException(status_code=400, detail=f"Uploaded file '{file.filename}' is empty.")

        data_stream = io.BytesIO(contents)
        client.put_object(
            config.bucket,
            object_key,
            data_stream,
            length=len(contents),
            content_type=file.content_type or "video/mp4",
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
                filename=Path(file.filename).name,
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
    validate_output_video(str(actual_output))
    ensure_browser_playable_mp4(str(actual_output))
    validate_output_video(str(actual_output))
    return actual_output
