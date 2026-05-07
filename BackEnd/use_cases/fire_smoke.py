"""
Fire & Smoke Detection — Pre-built Use Case
=============================================
Detects fire and smoke in surveillance footage using YOLOv8.

Industry Application:
    Manufacturing plants, warehouses, server rooms — early fire/smoke detection
    from CCTV before traditional sensors trigger. Reduces emergency response time
    from minutes to seconds.

Uses a general YOLO model to detect objects that resemble fire/smoke based on
color analysis (HSV) overlaid on person-free regions, combined with YOLO detections
for any fire-related classes if available in the model.
"""

import os
import time
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np

from use_cases.base import (
    FONT, C_RED, C_ORANGE, C_YELLOW, C_WHITE, C_GREEN, C_GRAY,
    auto_device, open_video, create_writer, build_output_path,
    load_model, draw_hud_panel, draw_alert_bar, draw_label, validate_output_video,
)


BASE_DIR = Path(__file__).resolve().parents[2]
DEFAULT_FIRE_SMOKE_MODEL_PATH = BASE_DIR / "models" / "fire_smoke" / "best.pt"

# HSV ranges for fire and smoke detection
FIRE_RANGES = [
    (np.array([0, 100, 200]), np.array([25, 255, 255])),    # bright orange/yellow fire
    (np.array([0, 150, 150]), np.array([15, 255, 255])),    # red-orange fire
    (np.array([18, 80, 200]), np.array([35, 255, 255])),    # yellow flame tips
]

SMOKE_RANGES = [
    (np.array([0, 0, 120]), np.array([180, 50, 220])),      # light gray smoke
    (np.array([0, 0, 70]), np.array([180, 40, 160])),       # dark gray smoke
]

MIN_FIRE_AREA = 500     # minimum pixel area for fire blob
MIN_SMOKE_AREA = 1000   # minimum pixel area for smoke blob
K5 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))


def normalize_fire_class_name(name: str | None) -> str | None:
    normalized = str(name or "").strip().lower()
    if not normalized:
        return None
    if "smoke" in normalized:
        return "smoke"
    if "fire" in normalized or "flame" in normalized:
        return "fire"
    return None


def _normalize_model_names(names: object) -> list[str]:
    if isinstance(names, dict):
        raw_names = list(names.values())
    elif isinstance(names, (list, tuple)):
        raw_names = list(names)
    else:
        raw_names = []
    return [str(name).strip().lower() for name in raw_names if str(name).strip()]


def _resolve_fire_class_label(class_name: str | None, class_id: int, class_names: list[str]) -> str | None:
    normalized = normalize_fire_class_name(class_name)
    if normalized:
        return normalized
    if len(class_names) == 1:
        return "fire"
    if len(class_names) == 2:
        return "fire" if class_id == 0 else "smoke"
    if class_id == 0:
        return "fire"
    if class_id == 1:
        return "smoke"
    return None


def detect_fire_smoke_hsv(frame):
    """Detect fire and smoke regions using HSV color analysis."""
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    fh, fw = frame.shape[:2]

    fire_regions = []
    smoke_regions = []

    # Fire detection
    fire_mask = np.zeros((fh, fw), dtype=np.uint8)
    for lo, hi in FIRE_RANGES:
        m = cv2.inRange(hsv, lo, hi)
        fire_mask = cv2.bitwise_or(fire_mask, m)

    fire_mask = cv2.morphologyEx(fire_mask, cv2.MORPH_CLOSE, K5, iterations=2)
    fire_mask = cv2.morphologyEx(fire_mask, cv2.MORPH_OPEN, K5, iterations=1)

    contours, _ = cv2.findContours(fire_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area >= MIN_FIRE_AREA:
            x, y, w, h = cv2.boundingRect(cnt)
            fire_regions.append({"bbox": (x, y, x + w, y + h), "area": area, "confidence": min(1.0, area / 5000)})

    # Smoke detection
    smoke_mask = np.zeros((fh, fw), dtype=np.uint8)
    for lo, hi in SMOKE_RANGES:
        m = cv2.inRange(hsv, lo, hi)
        smoke_mask = cv2.bitwise_or(smoke_mask, m)

    smoke_mask = cv2.morphologyEx(smoke_mask, cv2.MORPH_CLOSE, K5, iterations=2)
    smoke_mask = cv2.morphologyEx(smoke_mask, cv2.MORPH_OPEN, K5, iterations=1)

    contours, _ = cv2.findContours(smoke_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area >= MIN_SMOKE_AREA:
            x, y, w, h = cv2.boundingRect(cnt)
            smoke_regions.append({"bbox": (x, y, x + w, y + h), "area": area, "confidence": min(1.0, area / 8000)})

    return fire_regions, smoke_regions


def _resolve_fire_smoke_model_path(model_path: str | None) -> str | None:
    candidates: list[Path] = []
    if model_path:
        candidates.append(Path(model_path))
    candidates.append(DEFAULT_FIRE_SMOKE_MODEL_PATH)

    for candidate in candidates:
        resolved = candidate if candidate.is_absolute() else BASE_DIR / candidate
        if resolved.is_file():
            return str(resolved)
    return None


def _extract_yolo_fire_smoke_regions(results, model) -> tuple[list[dict[str, object]], list[dict[str, object]], dict[str, object]]:
    if not results or results[0].boxes is None:
        return [], [], {
            "model_class_names": [],
            "detections_before_filter": 0,
            "detections_after_filter": 0,
        }

    fire_regions: list[dict[str, object]] = []
    smoke_regions: list[dict[str, object]] = []
    names = getattr(results[0], "names", None) or getattr(model, "names", {}) or {}
    model_class_names = _normalize_model_names(names)
    detections_before_filter = 0

    for box in results[0].boxes:
        detections_before_filter += 1
        x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
        conf_score = float(box.conf[0]) if box.conf is not None else 1.0
        cls_id = int(box.cls[0]) if box.cls is not None else -1
        class_name = str(names.get(cls_id, f"class_{cls_id}")).lower()
        semantic_class = _resolve_fire_class_label(class_name, cls_id, model_class_names)

        if semantic_class == "smoke":
            smoke_regions.append({
                "bbox": (x1, y1, x2, y2),
                "confidence": conf_score,
                "class_name": class_name,
                "semantic_class": semantic_class,
            })
        elif semantic_class == "fire":
            fire_regions.append({
                "bbox": (x1, y1, x2, y2),
                "confidence": conf_score,
                "class_name": class_name,
                "semantic_class": semantic_class,
            })

    return fire_regions, smoke_regions, {
        "model_class_names": model_class_names,
        "detections_before_filter": detections_before_filter,
        "detections_after_filter": len(fire_regions) + len(smoke_regions),
    }


def _run_fire_smoke_pass(
    *,
    input_p: str,
    out_p: str,
    cap_width: int,
    cap_height: int,
    sfps: float,
    yolo_model,
    use_yolo: bool,
    conf: float,
    show: bool,
) -> dict[str, object]:
    cap = open_video(input_p)
    writer = create_writer(out_p, sfps, cap_width, cap_height)

    frame_num = 0
    total_fire_events = 0
    total_smoke_events = 0
    max_severity = 0.0
    fire_frame_count = 0
    smoke_frame_count = 0
    fire_detected_any = False
    smoke_detected_any = False
    first_alert_frame: int | None = None
    t0 = time.time()
    model_class_names: list[str] = []
    detections_before_filter = 0
    detections_after_filter = 0

    try:
        while cap.isOpened():
            ok, frame = cap.read()
            if not ok:
                break
            frame_num += 1

            if use_yolo and yolo_model is not None:
                try:
                    results = yolo_model.predict(
                        source=frame,
                        conf=conf,
                        verbose=False,
                        imgsz=640,
                    )
                    fire_regions, smoke_regions, yolo_summary = _extract_yolo_fire_smoke_regions(results, yolo_model)
                    detections_before_filter += int(yolo_summary.get("detections_before_filter", 0))
                    detections_after_filter += int(yolo_summary.get("detections_after_filter", 0))
                    if not model_class_names:
                        model_class_names = list(yolo_summary.get("model_class_names", []))
                except Exception:
                    fire_regions, smoke_regions = detect_fire_smoke_hsv(frame)
            else:
                fire_regions, smoke_regions = detect_fire_smoke_hsv(frame)

            for region in fire_regions:
                x1, y1, x2, y2 = region["bbox"]
                cv2.rectangle(frame, (x1, y1), (x2, y2), C_RED, 2)
                draw_label(frame, f"FIRE {region['confidence']:.0%}", x1, y1, C_RED)
                total_fire_events += 1
                max_severity = max(max_severity, region["confidence"])
                fire_detected_any = True

            for region in smoke_regions:
                x1, y1, x2, y2 = region["bbox"]
                cv2.rectangle(frame, (x1, y1), (x2, y2), C_ORANGE, 2)
                draw_label(frame, f"SMOKE {region['confidence']:.0%}", x1, y1, C_ORANGE)
                total_smoke_events += 1
                max_severity = max(max_severity, region["confidence"])
                smoke_detected_any = True

            if fire_regions:
                fire_frame_count += 1
            if smoke_regions:
                smoke_frame_count += 1
            if (fire_regions or smoke_regions) and first_alert_frame is None:
                first_alert_frame = frame_num

            fps_live = frame_num / max(1e-6, time.time() - t0)
            has_alert = bool(fire_regions or smoke_regions)

            draw_hud_panel(frame, "FIRE & SMOKE MONITOR", [
                (f"Fire Events:  {total_fire_events}", C_RED if total_fire_events > 0 else C_GREEN),
                (f"Smoke Events: {total_smoke_events}", C_ORANGE if total_smoke_events > 0 else C_GREEN),
                (f"Severity:     {max_severity:.0%}", C_RED if max_severity > 0.5 else C_GRAY),
                (f"FPS:          {fps_live:.1f}", C_GRAY),
            ])

            if has_alert:
                draw_alert_bar(frame, "  FIRE / SMOKE DETECTED — IMMEDIATE ATTENTION REQUIRED  ")

            writer.write(frame)

            if show:
                disp = cv2.resize(frame, (min(cap_width, 1280), min(cap_height, 720)))
                cv2.imshow("Fire & Smoke Detection", disp)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break
    finally:
        cap.release()
        writer.release()
        if show:
            cv2.destroyAllWindows()

    processing_time_sec = round(time.time() - t0, 2)
    duration_sec = round(frame_num / sfps, 2) if sfps else None

    if fire_detected_any and smoke_detected_any:
        alert_type = "fire_and_smoke"
    elif fire_detected_any:
        alert_type = "fire_only"
    elif smoke_detected_any:
        alert_type = "smoke_only"
    else:
        alert_type = "no_alert"

    if max_severity >= 0.8 or (fire_detected_any and smoke_detected_any):
        severity = "high"
    elif max_severity >= 0.45:
        severity = "medium"
    else:
        severity = "low" if (fire_detected_any or smoke_detected_any) else "none"

    alert_summary = {
        "fire_detected": fire_detected_any,
        "smoke_detected": smoke_detected_any,
        "severity": severity,
        "alert_type": alert_type,
        "confidence_score": round(max_severity, 4),
        "response_time_sec": round(first_alert_frame / sfps, 2) if first_alert_frame and sfps else None,
        "status": "alert" if (fire_detected_any or smoke_detected_any) else "clear",
        "notes": "confidence_score is derived from the active fire/smoke detector and may fall back to HSV when the fine-tuned YOLO model is unavailable or produces no valid detections.",
        "metadata": {
            "total_fire_events": total_fire_events,
            "total_smoke_events": total_smoke_events,
            "fire_frame_percentage": round(fire_frame_count / max(1, frame_num) * 100, 1),
            "smoke_frame_percentage": round(smoke_frame_count / max(1, frame_num) * 100, 1),
            "first_alert_frame": first_alert_frame,
        },
    }

    return {
        "output_video": out_p,
        "metrics": {
            "total_fire_events": total_fire_events,
            "total_smoke_events": total_smoke_events,
            "frames_analyzed": frame_num,
            "max_severity": round(max_severity, 2),
            "fire_frame_percentage": round(fire_frame_count / max(1, frame_num) * 100, 1),
            "processing_time_sec": processing_time_sec,
            "video_duration_sec": duration_sec,
            "event_rows_generated": 1,
            "model_class_names": model_class_names,
            "detections_before_filter": detections_before_filter,
            "detections_after_filter": detections_after_filter,
        },
        "analytics": {
            "video_summary": {
                "frame_count": frame_num,
                "fps": round(float(sfps), 2) if sfps else None,
                "duration_sec": duration_sec,
                "processing_time_sec": processing_time_sec,
                "simulated_timestamp": datetime.now(timezone.utc).isoformat(),
            },
            "alert_summary": alert_summary,
        },
    }


def process_video(
    *,
    input_path: str,
    output_path: str | None = None,
    model_path: str | None = None,
    device: str | None = None,
    show: bool = False,
    conf: float = 0.40,
    **kwargs,
) -> dict:
    """
    Process video for fire and smoke detection.

    Returns dict with output_video path and metrics.
    """
    device = device or auto_device()
    input_p = os.path.abspath(input_path)
    out_p = build_output_path(input_p, output_path, "_fire_smoke")
    resolved_model_path = _resolve_fire_smoke_model_path(model_path)
    requested_mode = str(kwargs.get("model_mode") or "active").strip().lower()
    use_staged_threshold = requested_mode == "staging"
    yolo_conf = min(conf, 0.20 if use_staged_threshold else conf)
    yolo_model = None
    if resolved_model_path is not None:
        try:
            yolo_model = load_model(resolved_model_path)
        except Exception:
            yolo_model = None

    cap = open_video(input_p)
    fw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    fh = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    sfps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    cap.release()

    final_result: dict[str, object]
    if yolo_model is not None:
        final_result = _run_fire_smoke_pass(
            input_p=input_p,
            out_p=out_p,
            cap_width=fw,
            cap_height=fh,
            sfps=sfps,
            yolo_model=yolo_model,
            use_yolo=True,
            conf=yolo_conf,
            show=show,
        )
        attempted_model_class_names = list(final_result["metrics"].get("model_class_names", []))
        attempted_detections_before = int(final_result["metrics"].get("detections_before_filter", 0))
        attempted_detections_after = int(final_result["metrics"].get("detections_after_filter", 0))
        if int(final_result["metrics"]["detections_after_filter"]) == 0:
            fallback_result = _run_fire_smoke_pass(
                input_p=input_p,
                out_p=out_p,
                cap_width=fw,
                cap_height=fh,
                sfps=sfps,
                yolo_model=yolo_model,
                use_yolo=False,
                conf=conf,
                show=show,
            )
            fallback_result["metrics"]["model_class_names"] = attempted_model_class_names
            fallback_result["metrics"]["detections_before_filter"] = attempted_detections_before
            fallback_result["metrics"]["detections_after_filter"] = attempted_detections_after
            fallback_result["metrics"]["fallback_used"] = True
            fallback_result["metrics"]["fallback_reason"] = (
                "staged_fire_model_no_valid_detections"
                if use_staged_threshold
                else "fire_model_no_valid_detections"
            )
            fallback_result["metrics"]["inference_backend_used"] = "hsv_fallback"
            fallback_result["metrics"]["model_mode_used"] = requested_mode or "active"
            fallback_result["metrics"]["model_path_used"] = str(resolved_model_path)
            final_result = fallback_result
    else:
        final_result = _run_fire_smoke_pass(
            input_p=input_p,
            out_p=out_p,
            cap_width=fw,
            cap_height=fh,
            sfps=sfps,
            yolo_model=None,
            use_yolo=False,
            conf=conf,
            show=show,
        )
        final_result["metrics"]["fallback_used"] = True
        final_result["metrics"]["fallback_reason"] = "fire_model_unavailable"
        final_result["metrics"]["inference_backend_used"] = "hsv_fallback"
        final_result["metrics"]["model_mode_used"] = requested_mode or "active"
        final_result["metrics"]["model_path_used"] = str(resolved_model_path) if resolved_model_path else None

    final_result["metrics"].setdefault("model_mode_used", requested_mode or "active")
    final_result["metrics"].setdefault("model_path_used", str(resolved_model_path) if resolved_model_path else None)
    final_result["metrics"].setdefault("fallback_used", False)
    final_result["metrics"].setdefault("fallback_reason", None)
    final_result["metrics"].setdefault(
        "inference_backend_used",
        "yolo" if yolo_model is not None else "hsv_fallback",
    )

    validate_output_video(out_p)
    return final_result
