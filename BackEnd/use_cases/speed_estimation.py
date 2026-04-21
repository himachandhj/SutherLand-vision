"""
Vehicle Speed Estimation — Pre-built Use Case
===============================================
Estimate vehicle speeds using YOLOv8 tracking + displacement over time.

Industry Application:
    Traffic enforcement — detect speeding vehicles at intersections and roads.
    Smart city traffic management: average speed corridors, congestion detection,
    automated speed violation alerting.
"""

import os
import time
from collections import defaultdict
from datetime import datetime, timezone

import cv2
import numpy as np

from use_cases.base import (
    FONT, C_RED, C_GREEN, C_YELLOW, C_WHITE, C_GRAY, C_BLUE, C_CYAN,
    auto_device, open_video, create_writer, build_output_path,
    load_model, draw_hud_panel, draw_alert_bar, draw_label,
    extract_detection_payload, run_tracking_inference,
)

# Vehicle classes in COCO: car=2, motorcycle=3, bus=5, truck=7
VEHICLE_CLASSES = [2, 3, 5, 7]
VEHICLE_NAMES = {2: "Car", 3: "Motorcycle", 5: "Bus", 7: "Truck"}

# Speed estimation parameters
PIXELS_PER_METER = 8.0   # approximate calibration (adjustable)
SPEED_LIMIT_KMH = 60.0
SMOOTHING_FRAMES = 5


class VehicleTracker:
    """Track vehicle positions and estimate speed."""

    def __init__(self):
        self.positions: dict[int, list[tuple[float, float, float]]] = defaultdict(list)
        self.speeds: dict[int, float] = {}

    def update(self, track_id: int, cx: float, cy: float, timestamp: float):
        self.positions[track_id].append((cx, cy, timestamp))
        # Keep last N positions
        if len(self.positions[track_id]) > 30:
            self.positions[track_id] = self.positions[track_id][-30:]

        # Estimate speed from last few positions
        pts = self.positions[track_id]
        if len(pts) >= 2:
            recent = pts[-SMOOTHING_FRAMES:]
            dx = recent[-1][0] - recent[0][0]
            dy = recent[-1][1] - recent[0][1]
            dt = recent[-1][2] - recent[0][2]
            if dt > 0:
                px_per_sec = np.sqrt(dx**2 + dy**2) / dt
                m_per_sec = px_per_sec / PIXELS_PER_METER
                kmh = m_per_sec * 3.6
                self.speeds[track_id] = round(kmh, 1)

    def get_speed(self, track_id: int) -> float:
        return self.speeds.get(track_id, 0.0)


def process_video(
    *,
    input_path: str,
    output_path: str | None = None,
    model_path: str = "yolov8n.pt",
    device: str | None = None,
    show: bool = False,
    conf: float = 0.35,
    **kwargs,
) -> dict:
    """Process video for vehicle speed estimation."""
    device = device or auto_device()
    input_p = os.path.abspath(input_path)
    out_p = build_output_path(input_p, output_path, "_speed")

    model = load_model(model_path)
    tracker = VehicleTracker()

    cap = open_video(input_p)
    fw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    fh = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    sfps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    writer = create_writer(out_p, sfps, fw, fh)

    frame_num = 0
    total_vehicles = 0
    seen_ids = set()
    all_speeds = []
    speeding_count = 0
    track_summaries: dict[int, dict[str, float | int | str]] = {}
    t0 = time.time()

    try:
        while cap.isOpened():
            ok, frame = cap.read()
            if not ok:
                break
            frame_num += 1
            timestamp = frame_num / sfps

            try:
                results = run_tracking_inference(
                    model,
                    frame,
                    classes=VEHICLE_CLASSES,
                    conf=conf,
                    iou=0.70,
                    device=device,
                )
            except Exception:
                writer.write(frame)
                continue

            boxes, tids, class_ids, confs, _ = extract_detection_payload(results)

            for i, bbox in enumerate(boxes):
                x1, y1, x2, y2 = map(int, bbox)
                tid = tids[i] if i < len(tids) else i
                cls_id = class_ids[i] if i < len(class_ids) else 2
                conf_score = float(confs[i]) if i < len(confs) else 1.0
                cx, cy = (x1 + x2) / 2, (y1 + y2) / 2

                tracker.update(tid, cx, cy, timestamp)
                speed = tracker.get_speed(tid)
                veh_name = VEHICLE_NAMES.get(cls_id, "Vehicle")

                if tid not in seen_ids:
                    seen_ids.add(tid)
                    total_vehicles += 1

                summary = track_summaries.setdefault(
                    tid,
                    {
                        "object_type": veh_name.lower(),
                        "first_seen_frame": frame_num,
                        "last_seen_frame": frame_num,
                        "observations": 0,
                        "confidence_sum": 0.0,
                        "confidence_max": 0.0,
                        "speed_sum": 0.0,
                        "speed_samples": 0,
                        "max_speed_kmh": 0.0,
                    },
                )
                summary["last_seen_frame"] = frame_num
                summary["observations"] = int(summary["observations"]) + 1
                summary["confidence_sum"] = float(summary["confidence_sum"]) + conf_score
                summary["confidence_max"] = max(float(summary["confidence_max"]), conf_score)
                if speed > 0:
                    summary["speed_sum"] = float(summary["speed_sum"]) + speed
                    summary["speed_samples"] = int(summary["speed_samples"]) + 1
                    summary["max_speed_kmh"] = max(float(summary["max_speed_kmh"]), speed)
                    all_speeds.append(speed)

                is_speeding = speed > SPEED_LIMIT_KMH

                if is_speeding and speed > 0:
                    speeding_count += 1

                color = C_RED if is_speeding else C_GREEN
                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

                speed_str = f"{speed:.0f} km/h" if speed > 0 else "..."
                label_text = f"#{tid} {veh_name} {speed_str}"
                draw_label(frame, label_text, x1, y1, C_RED if is_speeding else C_BLUE)

                if is_speeding:
                    draw_label(frame, "SPEEDING", x1, y2 + 18, C_RED)

            # HUD
            fps_live = frame_num / max(1e-6, time.time() - t0)
            avg_speed = round(np.mean(all_speeds), 1) if all_speeds else 0.0
            max_speed = round(max(all_speeds), 1) if all_speeds else 0.0

            draw_hud_panel(frame, "SPEED MONITOR", [
                (f"Vehicles:     {total_vehicles}", C_WHITE),
                (f"Avg Speed:    {avg_speed} km/h", C_CYAN),
                (f"Max Speed:    {max_speed} km/h", C_RED if max_speed > SPEED_LIMIT_KMH else C_GREEN),
                (f"Violations:   {speeding_count}", C_RED if speeding_count > 0 else C_GREEN),
                (f"FPS:          {fps_live:.1f}", C_GRAY),
            ])

            if speeding_count > 0:
                draw_alert_bar(frame, f"  {speeding_count} SPEED VIOLATION(S) DETECTED  ")

            writer.write(frame)

            if show:
                disp = cv2.resize(frame, (min(fw, 1280), min(fh, 720)))
                cv2.imshow("Speed Estimation", disp)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break

    finally:
        cap.release()
        writer.release()
        if show:
            cv2.destroyAllWindows()

    if not os.path.isfile(out_p) or os.path.getsize(out_p) == 0:
        raise RuntimeError(f"Output missing or empty: {out_p}")

    unique_speeds = list(set(all_speeds))
    processing_time_sec = round(time.time() - t0, 2)
    duration_sec = round(frame_num / sfps, 2) if sfps else None
    speed_summaries = []

    for track_id, summary in sorted(track_summaries.items()):
        max_speed = round(float(summary["max_speed_kmh"]), 1)
        speed_samples = int(summary["speed_samples"])
        avg_speed = round(float(summary["speed_sum"]) / max(1, speed_samples), 1) if speed_samples else 0.0
        detected_speed = max_speed if max_speed > 0 else avg_speed
        is_overspeeding = detected_speed > SPEED_LIMIT_KMH
        speed_summaries.append(
            {
                "object_id": str(track_id),
                "object_type": str(summary["object_type"]),
                "detected_speed_kmh": detected_speed,
                "speed_limit_kmh": SPEED_LIMIT_KMH,
                "is_overspeeding": is_overspeeding,
                "excess_speed_kmh": round(max(detected_speed - SPEED_LIMIT_KMH, 0.0), 1),
                "confidence_score": round(float(summary["confidence_sum"]) / max(1, int(summary["observations"])), 4),
                "status": "violation" if is_overspeeding else "normal",
                "notes": "detected_speed_kmh uses pixel-displacement calibration and is derived from tracked motion.",
                "metadata": {
                    "first_seen_frame": int(summary["first_seen_frame"]),
                    "last_seen_frame": int(summary["last_seen_frame"]),
                    "first_seen_sec": round(int(summary["first_seen_frame"]) / sfps, 2) if sfps else None,
                    "last_seen_sec": round(int(summary["last_seen_frame"]) / sfps, 2) if sfps else None,
                    "observations": int(summary["observations"]),
                    "speed_samples": speed_samples,
                    "avg_speed_kmh": avg_speed,
                    "max_speed_kmh": max_speed,
                    "max_confidence": round(float(summary["confidence_max"]), 4),
                },
            }
        )

    return {
        "output_video": out_p,
        "metrics": {
            "total_vehicles": total_vehicles,
            "avg_speed_kmh": round(np.mean(unique_speeds), 1) if unique_speeds else 0.0,
            "max_speed_kmh": round(max(unique_speeds), 1) if unique_speeds else 0.0,
            "speeding_violations": speeding_count,
            "frames_analyzed": frame_num,
            "processing_time_sec": processing_time_sec,
            "video_duration_sec": duration_sec,
            "event_rows_generated": len(speed_summaries),
        },
        "analytics": {
            "video_summary": {
                "frame_count": frame_num,
                "fps": round(float(sfps), 2) if sfps else None,
                "duration_sec": duration_sec,
                "processing_time_sec": processing_time_sec,
                "simulated_timestamp": datetime.now(timezone.utc).isoformat(),
                "zone_speed_limit_kmh": SPEED_LIMIT_KMH,
            },
            "speed_summaries": speed_summaries,
        },
    }
