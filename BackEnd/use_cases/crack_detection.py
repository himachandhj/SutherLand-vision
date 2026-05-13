"""
Crack Detection — Pre-built Use Case
=====================================
Detect surface cracks in infrastructure and construction footage using a
fine-tuned YOLO model.
"""

from __future__ import annotations

import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import cv2

from use_cases.base import (
    C_GRAY,
    C_GREEN,
    C_ORANGE,
    C_RED,
    C_WHITE,
    auto_device,
    build_output_path,
    create_writer,
    draw_hud_panel,
    draw_label,
    load_model,
    open_video,
    read_video_profile,
    validate_output_video,
)


BASE_DIR = Path(__file__).resolve().parents[1]
DEFAULT_CRACK_MODEL_PATH = Path("models/crack_detection/best.pt")
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def _resolve_model_path(model_path: str | None) -> str:
    candidate = Path(model_path or DEFAULT_CRACK_MODEL_PATH)
    resolved = candidate if candidate.is_absolute() else BASE_DIR / candidate
    if not resolved.is_file():
        raise RuntimeError("Crack detection model not found at models/crack_detection/best.pt")
    return str(resolved)


def _normalize_names(names: object) -> dict[int, str]:
    if isinstance(names, dict):
        return {int(class_id): str(name) for class_id, name in names.items()}
    if isinstance(names, (list, tuple)):
        return {index: str(name) for index, name in enumerate(names)}
    return {}


def _is_crack_class(class_name: str) -> bool:
    normalized = class_name.strip().lower().replace("_", " ").replace("-", " ")
    return "crack" in normalized


def _severity_for_confidence(confidence: float) -> str:
    if confidence >= 0.75:
        return "high"
    if confidence >= 0.50:
        return "medium"
    return "low"


def _severity_color(severity: str) -> tuple[int, int, int]:
    if severity == "high":
        return C_RED
    if severity == "medium":
        return C_ORANGE
    return C_GREEN


def _run_frame_inference(
    *,
    frame,
    model,
    class_names: dict[int, str],
    conf: float,
    device: str | None,
    frame_number: int,
    fps: float,
) -> tuple[Any, dict[str, Any]]:
    try:
        results = model.predict(
            source=frame,
            conf=conf,
            device=device,
            imgsz=640,
            verbose=False,
        )
    except Exception:
        return frame, {
            "detections_in_frame": 0,
            "confidence_sum": 0.0,
            "max_confidence": 0.0,
            "events": [],
            "preview_detections": [],
        }

    annotated = frame.copy()
    detections_in_frame = 0
    confidence_sum = 0.0
    max_confidence = 0.0
    events: list[dict[str, Any]] = []
    preview_detections: list[dict[str, Any]] = []

    if results and results[0].boxes is not None:
        det = results[0].boxes
        boxes = det.xyxy.cpu().numpy() if det.xyxy is not None and len(det.xyxy) > 0 else []
        class_ids = det.cls.cpu().numpy().astype(int).tolist() if det.cls is not None else []
        confidences = det.conf.cpu().numpy().tolist() if det.conf is not None else [1.0] * len(boxes)

        for index, bbox in enumerate(boxes):
            x1, y1, x2, y2 = map(int, bbox)
            cls_id = class_ids[index] if index < len(class_ids) else -1
            confidence = float(confidences[index]) if index < len(confidences) else 1.0
            raw_class_name = class_names.get(cls_id, f"class_{cls_id}")
            class_name = str(raw_class_name or f"class_{cls_id}")

            detections_in_frame += 1
            confidence_sum += confidence
            max_confidence = max(max_confidence, confidence)

            severity = _severity_for_confidence(confidence)
            color = _severity_color(severity)
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
            label_prefix = "CRACK" if _is_crack_class(class_name) else class_name
            draw_label(annotated, f"{label_prefix} {confidence:.0%}", x1, y1, color)

            events.append(
                {
                    "frame_number": frame_number,
                    "timestamp_sec": round(frame_number / fps, 3),
                    "class_name": class_name,
                    "confidence_score": round(confidence, 4),
                    "bbox": [x1, y1, x2, y2],
                    "severity": severity,
                }
            )
            preview_detections.append(
                {
                    "class": class_name.lower(),
                    "confidence": round(confidence, 4),
                    "severity": severity,
                    "bbox": [x1, y1, x2, y2],
                }
            )

    return annotated, {
        "detections_in_frame": detections_in_frame,
        "confidence_sum": confidence_sum,
        "max_confidence": max_confidence,
        "events": events,
        "preview_detections": preview_detections,
    }


def process_image(
    *,
    frame,
    model_path: str = "models/crack_detection/best.pt",
    device: str | None = None,
    conf: float = 0.25,
) -> dict[str, Any]:
    """Run crack detection on a single image frame for playground preview."""
    device = device or auto_device()
    resolved_model_path = _resolve_model_path(model_path)
    model = load_model(resolved_model_path)
    class_names = _normalize_names(getattr(model, "names", {}))

    annotated, frame_summary = _run_frame_inference(
        frame=frame,
        model=model,
        class_names=class_names,
        conf=conf,
        device=device,
        frame_number=1,
        fps=1.0,
    )
    detections_in_frame = int(frame_summary["detections_in_frame"])
    confidence_sum = float(frame_summary["confidence_sum"])
    max_confidence = float(frame_summary["max_confidence"])
    avg_confidence = round(confidence_sum / detections_in_frame, 4) if detections_in_frame else 0.0

    return {
        "annotated_image": annotated,
        "detections": frame_summary["preview_detections"],
        "metrics": {
            "crack_detections": detections_in_frame,
            "frames_analyzed": 1,
            "frames_with_cracks": 1 if detections_in_frame > 0 else 0,
            "crack_rate_pct": 100.0 if detections_in_frame > 0 else 0.0,
            "max_confidence": round(max_confidence, 4),
            "avg_confidence": avg_confidence,
        },
        "analytics": {
            "video_summary": {
                "frame_count": 1,
                "fps": 1.0,
                "duration_sec": 0.0,
                "processing_time_sec": 0.0,
                "simulated_timestamp": datetime.now(timezone.utc).isoformat(),
            },
            "crack_events": frame_summary["events"],
        },
    }


def process_video(
    *,
    input_path: str,
    output_path: str | None = None,
    model_path: str = "models/crack_detection/best.pt",
    device: str | None = None,
    show: bool = False,
    conf: float = 0.25,
    **kwargs: Any,
) -> dict:
    """Process video for crack detection."""
    del kwargs

    device = device or auto_device()
    input_p = os.path.abspath(input_path)
    out_p = build_output_path(input_p, output_path, "_crack_detection")
    if Path(input_p).suffix.lower() in IMAGE_EXTENSIONS:
        frame = cv2.imread(input_p)
        if frame is None:
            raise RuntimeError(f"Unable to read crack detection input image: {input_path}")
        image_result = process_image(
            frame=frame,
            model_path=model_path,
            device=device,
            conf=conf,
        )
        annotated_image = image_result.get("annotated_image")
        if annotated_image is None:
            raise RuntimeError("Crack detection did not produce an annotated image.")
        output_parent = Path(out_p).parent
        output_parent.mkdir(parents=True, exist_ok=True)
        if not cv2.imwrite(out_p, annotated_image):
            raise RuntimeError(f"Unable to write crack detection output image: {out_p}")
        return {
            "output_video": out_p,
            "metrics": {
                **(image_result.get("metrics", {}) if isinstance(image_result.get("metrics"), dict) else {}),
                "processing_time_sec": image_result.get("metrics", {}).get("processing_time_sec", 0.0),
                "video_duration_sec": image_result.get("metrics", {}).get("video_duration_sec", 0.0),
            },
            "analytics": image_result.get("analytics", {}),
        }

    resolved_model_path = _resolve_model_path(model_path)
    model = load_model(resolved_model_path)
    class_names = _normalize_names(getattr(model, "names", {}))

    cap = open_video(input_p)
    source_profile = read_video_profile(input_p, cap=cap)
    frame_width = int(source_profile.get("width") or cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    frame_height = int(source_profile.get("height") or cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    source_fps = float(source_profile.get("normalized_fps") or source_profile.get("fps") or 25.0)
    total_frames = int(source_profile.get("frame_count") or cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    source_duration_sec = float(source_profile.get("duration_sec") or 0.0)
    writer = create_writer(out_p, source_fps, frame_width, frame_height)

    frame_num = 0
    crack_detections = 0
    frames_with_cracks = 0
    max_confidence = 0.0
    confidence_sum = 0.0
    crack_events: list[dict[str, Any]] = []
    t0 = time.time()

    try:
        while cap.isOpened():
            ok, frame = cap.read()
            if not ok:
                break
            frame_num += 1

            frame, frame_summary = _run_frame_inference(
                frame=frame,
                model=model,
                class_names=class_names,
                conf=conf,
                device=device,
                frame_number=frame_num,
                fps=source_fps,
            )
            detections_in_frame = int(frame_summary["detections_in_frame"])
            crack_detections += detections_in_frame
            confidence_sum += float(frame_summary["confidence_sum"])
            max_confidence = max(max_confidence, float(frame_summary["max_confidence"]))
            crack_events.extend(frame_summary["events"])

            if detections_in_frame > 0:
                frames_with_cracks += 1

            elapsed = max(1e-6, time.time() - t0)
            fps_live = frame_num / elapsed
            avg_confidence_live = confidence_sum / crack_detections if crack_detections else 0.0
            crack_rate_pct = (frames_with_cracks / frame_num * 100.0) if frame_num else 0.0

            draw_hud_panel(
                frame,
                "CRACK DETECTION",
                [
                    (f"Detections:   {crack_detections}", C_WHITE),
                    (f"Crack Frames: {frames_with_cracks}", C_GREEN),
                    (f"Crack Rate:   {crack_rate_pct:.1f}%", C_ORANGE),
                    (f"Max Conf:     {max_confidence:.2f}", C_RED if max_confidence >= 0.75 else C_WHITE),
                    (f"Avg Conf:     {avg_confidence_live:.2f}", C_WHITE),
                    (f"FPS:          {fps_live:.1f}", C_GRAY),
                ],
            )

            writer.write(frame)

            if show:
                display = cv2.resize(frame, (min(frame_width, 1280), min(frame_height, 720)))
                cv2.imshow("Crack Detection", display)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break
    finally:
        cap.release()
        writer.release()
        if show:
            cv2.destroyAllWindows()

    validate_output_video(out_p)

    processing_time_sec = round(time.time() - t0, 3)
    if source_duration_sec > 0:
        video_duration_sec = round(source_duration_sec, 3)
    else:
        video_duration_sec = round((total_frames / source_fps) if total_frames > 0 and source_fps > 0 else (frame_num / source_fps if source_fps > 0 else 0.0), 3)
    avg_confidence = round(confidence_sum / crack_detections, 4) if crack_detections else 0.0
    crack_rate_pct = round((frames_with_cracks / frame_num * 100.0), 2) if frame_num else 0.0

    return {
        "output_video": out_p,
        "metrics": {
            "crack_detections": crack_detections,
            "frames_analyzed": frame_num,
            "frames_with_cracks": frames_with_cracks,
            "crack_rate_pct": crack_rate_pct,
            "max_confidence": round(max_confidence, 4),
            "avg_confidence": avg_confidence,
            "processing_time_sec": processing_time_sec,
            "video_duration_sec": video_duration_sec,
            "input_fps": round(float(source_fps), 4) if source_fps > 0 else None,
            "raw_input_fps": source_profile.get("raw_fps"),
            "fps_source": source_profile.get("fps_source"),
        },
        "analytics": {
            "video_summary": {
                "frame_count": frame_num,
                "fps": round(float(source_fps), 3),
                "duration_sec": video_duration_sec,
                "processing_time_sec": processing_time_sec,
                "simulated_timestamp": datetime.now(timezone.utc).isoformat(),
            },
            "crack_events": crack_events,
        },
    }
