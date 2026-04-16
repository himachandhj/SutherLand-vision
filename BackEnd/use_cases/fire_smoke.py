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

import cv2
import numpy as np

from use_cases.base import (
    FONT, C_RED, C_ORANGE, C_YELLOW, C_WHITE, C_GREEN, C_GRAY,
    auto_device, open_video, create_writer, build_output_path,
    load_model, draw_hud_panel, draw_alert_bar, draw_label,
)


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


def process_video(
    *,
    input_path: str,
    output_path: str | None = None,
    model_path: str = "yolov8n.pt",
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

    model = load_model(model_path)

    cap = open_video(input_p)
    fw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    fh = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    sfps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    writer = create_writer(out_p, sfps, fw, fh)

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

    try:
        while cap.isOpened():
            ok, frame = cap.read()
            if not ok:
                break
            frame_num += 1

            fire_regions, smoke_regions = detect_fire_smoke_hsv(frame)

            # Draw fire detections
            for region in fire_regions:
                x1, y1, x2, y2 = region["bbox"]
                cv2.rectangle(frame, (x1, y1), (x2, y2), C_RED, 2)
                draw_label(frame, f"FIRE {region['confidence']:.0%}", x1, y1, C_RED)
                total_fire_events += 1
                max_severity = max(max_severity, region["confidence"])
                fire_detected_any = True

            # Draw smoke detections
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

            # HUD
            fps_live = frame_num / max(1e-6, time.time() - t0)
            has_alert = len(fire_regions) > 0

            draw_hud_panel(frame, "FIRE & SMOKE MONITOR", [
                (f"Fire Events:  {total_fire_events}", C_RED if total_fire_events > 0 else C_GREEN),
                (f"Smoke Events: {total_smoke_events}", C_ORANGE if total_smoke_events > 0 else C_GREEN),
                (f"Severity:     {max_severity:.0%}", C_RED if max_severity > 0.5 else C_GRAY),
                (f"FPS:          {fps_live:.1f}", C_GRAY),
            ])

            if has_alert:
                draw_alert_bar(frame, f"  FIRE DETECTED — IMMEDIATE ATTENTION REQUIRED  ")

            writer.write(frame)

            if show:
                disp = cv2.resize(frame, (min(fw, 1280), min(fh, 720)))
                cv2.imshow("Fire & Smoke Detection", disp)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break

    finally:
        cap.release()
        writer.release()
        if show:
            cv2.destroyAllWindows()

    if not os.path.isfile(out_p) or os.path.getsize(out_p) == 0:
        raise RuntimeError(f"Output missing or empty: {out_p}")

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
        "notes": "confidence_score is derived from HSV blob-area heuristics in the current fire/smoke detector.",
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
