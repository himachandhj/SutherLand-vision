"""
FastAPI wrapper for ppe_detection.py

Run:
    pip install -r requirements_backend.txt
    uvicorn backend_api:app --reload --host 0.0.0.0 --port 8001

Endpoints:
    GET  /health
    POST /api/analyze-image   -> annotated image (base64)
    POST /detect/             -> process uploaded video and return output path

Notes:
- Put this file in the same folder as ppe_detection.py
- The video endpoint reuses the existing CLI script for reliability
- The image endpoint uses the same detector logic directly in-process
"""

from __future__ import annotations

import base64
import os
import subprocess
import sys
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Tuple

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from ultralytics import YOLO

from ppe_detection import (
    PPEDetector,
    WorkerState,
    auto_device,
    check_vis,
    create_writer,
    draw_person,
    load_ppe_model,
    resolve_ppe_model_path,
)

# -----------------------------------------------------------------------------
# Paths / config
# -----------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "outputs"
UPLOAD_DIR = BASE_DIR / "uploads"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

PERSON_MODEL_NAME = os.getenv("PERSON_MODEL", "yolo11m.pt")
PPE_MODEL_PATH = os.getenv("PPE_MODEL_PATH") or resolve_ppe_model_path()
DEVICE = os.getenv("DEVICE") or auto_device()
CONF = float(os.getenv("CONF", "0.40"))
PPE_CONF = float(os.getenv("PPE_CONF", "0.30"))

# -----------------------------------------------------------------------------
# FastAPI app
# -----------------------------------------------------------------------------

app = FastAPI(title="PPE Vision API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/outputs", StaticFiles(directory=str(OUTPUT_DIR)), name="outputs")


# -----------------------------------------------------------------------------
# Lazy-loaded models
# -----------------------------------------------------------------------------

@lru_cache(maxsize=1)
def get_person_model() -> YOLO:
    try:
        return YOLO(PERSON_MODEL_NAME)
    except Exception as exc:
        raise RuntimeError(f"Failed to load person model '{PERSON_MODEL_NAME}': {exc}") from exc


@lru_cache(maxsize=1)
def get_ppe_detector() -> PPEDetector:
    ppe_model, ppe_names = load_ppe_model(PPE_MODEL_PATH or None)
    return PPEDetector(ppe_model, ppe_names, PPE_CONF, DEVICE)


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------

def _save_upload(file: UploadFile, target_dir: Path) -> Path:
    suffix = Path(file.filename or "").suffix or ".bin"
    target = target_dir / f"{Path(file.filename or 'upload').stem}_{next(tempfile._get_candidate_names())}{suffix}"
    with target.open("wb") as f:
        f.write(file.file.read())
    return target


def _encode_jpeg_to_base64(frame: np.ndarray) -> str:
    ok, buffer = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to encode output image.")
    return "data:image/jpeg;base64," + base64.b64encode(buffer).decode("utf-8")


def _analyze_frame(frame: np.ndarray) -> Tuple[np.ndarray, List[Dict[str, Any]]]:
    """
    Returns the annotated frame and a JSON-serializable detections list.
    """
    person_model = get_person_model()
    detector = get_ppe_detector()

    h, w = frame.shape[:2]

    # Use predict for a single image/frame
    result = person_model.predict(
        source=frame,
        classes=[0],
        conf=CONF,
        device=DEVICE,
        verbose=False,
    )

    boxes: List[np.ndarray] = []
    if result and result[0].boxes is not None and result[0].boxes.xyxy is not None:
        boxes = result[0].boxes.xyxy.cpu().numpy().tolist()

    vis_list = [check_vis(b, h, w) for b in boxes]
    ppe_list = detector.evaluate_frame(frame, boxes, vis_list)

    detections: List[Dict[str, Any]] = []
    workers: Dict[int, WorkerState] = {}

    for idx, (bbox, vis) in enumerate(zip(boxes, vis_list), start=1):
        worker = WorkerState(idx)
        worker.update(1, ppe_list[idx - 1])
        workers[idx] = worker
        draw_person(frame, bbox, worker, lw=2)

        detections.append(
            {
                "id": idx,
                "bbox": [int(v) for v in bbox],
                "visibility": vis,
                "helmet": ppe_list[idx - 1]["helmet"],
                "vest": ppe_list[idx - 1]["vest"],
                "shoes": ppe_list[idx - 1]["shoes"],
                "status": "PASS" if worker.is_passing else "FAIL",
                "missing_items": worker.missing_items,
            }
        )

    return frame, detections


def _process_video_with_cli(input_path: Path, output_path: Path) -> None:
    """
    Reuse the existing CLI script for video processing.
    This keeps the video behavior identical to your current working script.
    """
    cmd = [
        sys.executable,
        str(BASE_DIR / "ppe_detection.py"),
        "--input",
        str(input_path),
        "--output",
        str(output_path),
        "--device",
        DEVICE,
    ]

    # Avoid opening a GUI window in the API server
    # (we intentionally do not pass --show)
    completed = subprocess.run(cmd, capture_output=True, text=True)
    if completed.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Video processing failed.",
                "stderr": completed.stderr[-4000:],
                "stdout": completed.stdout[-4000:],
            },
        )


# -----------------------------------------------------------------------------
# Routes
# -----------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "device": DEVICE, "person_model": PERSON_MODEL_NAME}


@app.post("/api/analyze-image")
async def analyze_image(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No image file received.")

    raw = await file.read()
    arr = np.frombuffer(raw, np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(status_code=400, detail="Unsupported or corrupted image file.")

    annotated, detections = _analyze_frame(frame)
    return {
        "message": "Image analyzed successfully.",
        "image_base64": _encode_jpeg_to_base64(annotated),
        "detections": detections,
    }


@app.post("/detect/")
async def detect_video(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No video file received.")

    input_path = _save_upload(file, UPLOAD_DIR)
    output_name = f"{input_path.stem}_ppe.mp4"
    output_path = OUTPUT_DIR / output_name

    try:
        _process_video_with_cli(input_path, output_path)
    finally:
        # keep the uploaded file for debugging only if you want;
        # uncomment the next line to delete it after processing:
        # input_path.unlink(missing_ok=True)
        pass

    if not output_path.exists() or output_path.stat().st_size == 0:
        raise HTTPException(status_code=500, detail="Processed video was not created.")

    return {
        "message": "Video processed successfully.",
        "output_video": f"outputs/{output_path.name}",
    }
