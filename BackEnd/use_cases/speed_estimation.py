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
VEHICLE_NAME_ALIASES = {
    "car": "car",
    "vehicle": "car",
    "sedan": "car",
    "truck": "truck",
    "lorry": "truck",
    "bus": "bus",
    "motorcycle": "motorcycle",
    "motorbike": "motorcycle",
    "bike": "motorcycle",
}
DEFAULT_VEHICLE_CLASS_NAMES = ["car", "motorcycle", "bus", "truck"]

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


def normalize_vehicle_name(raw_name: str | int | None) -> str:
    normalized = str(raw_name or "").strip().lower().replace("-", " ").replace("_", " ")
    normalized = " ".join(normalized.split())
    if normalized in VEHICLE_NAME_ALIASES:
        return VEHICLE_NAME_ALIASES[normalized]
    if normalized in DEFAULT_VEHICLE_CLASS_NAMES:
        return normalized
    return normalized or "vehicle"


def vehicle_display_name(object_type: str) -> str:
    value = normalize_vehicle_name(object_type)
    if value == "motorcycle":
        return "Motorcycle"
    if value == "car":
        return "Car"
    if value == "bus":
        return "Bus"
    if value == "truck":
        return "Truck"
    return value.title()


def ensure_class_count_keys(source: dict[str, int]) -> dict[str, int]:
    return {name: int(source.get(name, 0)) for name in DEFAULT_VEHICLE_CLASS_NAMES}


def resolve_vehicle_tracking_class_ids(model) -> list[int]:
    raw_names = getattr(model, "names", {}) or {}
    if isinstance(raw_names, list):
        raw_names = {index: value for index, value in enumerate(raw_names)}
    resolved = [
        int(class_id)
        for class_id, name in raw_names.items()
        if normalize_vehicle_name(name) in DEFAULT_VEHICLE_CLASS_NAMES
    ]
    return resolved or list(VEHICLE_CLASSES)


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
    vehicle_class_ids = resolve_vehicle_tracking_class_ids(model)
    tracker = VehicleTracker()

    cap = open_video(input_p)
    fw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    fh = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    sfps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    writer = create_writer(out_p, sfps, fw, fh)
    line_x = fw // 2

    frame_num = 0
    total_vehicles = 0
    seen_ids = set()
    class_track_ids: dict[str, set[int]] = defaultdict(set)
    class_crossed_ids: dict[str, set[int]] = defaultdict(set)
    prev_positions: dict[int, float] = {}
    crossed_ids: set[int] = set()
    per_class_speed_samples: dict[str, list[float]] = defaultdict(list)
    direction_by_track: dict[int, str] = {}
    current_objects_by_class: dict[str, int] = defaultdict(int)
    volume_windows: list[int] = []
    window_count = 0
    window_frames = max(1, int(sfps * 60))
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
                    classes=vehicle_class_ids,
                    conf=conf,
                    iou=0.70,
                    device=device,
                )
            except Exception:
                writer.write(frame)
                continue

            boxes, tids, class_ids, confs, names = extract_detection_payload(results)
            current_objects_by_class = defaultdict(int)

            for i, bbox in enumerate(boxes):
                x1, y1, x2, y2 = map(int, bbox)
                tid = tids[i] if i < len(tids) else i
                cls_id = class_ids[i] if i < len(class_ids) else 2
                conf_score = float(confs[i]) if i < len(confs) else 1.0
                cx, cy = (x1 + x2) / 2, (y1 + y2) / 2

                tracker.update(tid, cx, cy, timestamp)
                speed = tracker.get_speed(tid)
                detected_name = names.get(cls_id, VEHICLE_NAMES.get(cls_id, cls_id)) if isinstance(names, dict) else VEHICLE_NAMES.get(cls_id, cls_id)
                veh_type = normalize_vehicle_name(detected_name)
                veh_name = vehicle_display_name(veh_type)
                current_objects_by_class[veh_type] += 1

                if tid not in seen_ids:
                    seen_ids.add(tid)
                    total_vehicles += 1
                class_track_ids[veh_type].add(tid)

                crossed_line = False
                direction = direction_by_track.get(tid, "unknown")
                if tid in prev_positions:
                    prev_x = prev_positions[tid]
                    if prev_x < line_x <= cx:
                        direction = "left_to_right"
                        direction_by_track[tid] = direction
                        if tid not in crossed_ids:
                            crossed_ids.add(tid)
                            class_crossed_ids[veh_type].add(tid)
                            crossed_line = True
                            window_count += 1
                    elif prev_x > line_x >= cx:
                        direction = "right_to_left"
                        direction_by_track[tid] = direction
                prev_positions[tid] = cx

                summary = track_summaries.setdefault(
                    tid,
                    {
                        "object_type": veh_type,
                        "first_seen_frame": frame_num,
                        "last_seen_frame": frame_num,
                        "observations": 0,
                        "confidence_sum": 0.0,
                        "confidence_max": 0.0,
                        "speed_sum": 0.0,
                        "speed_samples": 0,
                        "max_speed_kmh": 0.0,
                        "crossed_line": False,
                        "direction": "unknown",
                    },
                )
                if summary.get("object_type") in {None, "", "vehicle"} and veh_type != "vehicle":
                    summary["object_type"] = veh_type
                summary["last_seen_frame"] = frame_num
                summary["observations"] = int(summary["observations"]) + 1
                summary["confidence_sum"] = float(summary["confidence_sum"]) + conf_score
                summary["confidence_max"] = max(float(summary["confidence_max"]), conf_score)
                summary["direction"] = direction
                if crossed_line:
                    summary["crossed_line"] = True
                if speed > 0:
                    summary["speed_sum"] = float(summary["speed_sum"]) + speed
                    summary["speed_samples"] = int(summary["speed_samples"]) + 1
                    summary["max_speed_kmh"] = max(float(summary["max_speed_kmh"]), speed)
                    all_speeds.append(speed)
                    per_class_speed_samples[veh_type].append(speed)

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

            if frame_num % window_frames == 0:
                volume_windows.append(window_count)
                window_count = 0

            cv2.line(frame, (line_x, 0), (line_x, fh), C_CYAN, 2, cv2.LINE_AA)
            cv2.putText(frame, "COUNT LINE", (line_x + 10, 30), FONT, 0.5, C_CYAN, 2, cv2.LINE_AA)

            # HUD
            fps_live = frame_num / max(1e-6, time.time() - t0)
            avg_speed = round(np.mean(all_speeds), 1) if all_speeds else 0.0
            max_speed = round(max(all_speeds), 1) if all_speeds else 0.0
            class_wise_counts = ensure_class_count_keys({name: len(track_ids) for name, track_ids in class_track_ids.items()})
            crossed_counts = ensure_class_count_keys({name: len(track_ids) for name, track_ids in class_crossed_ids.items()})
            current_frame_counts = ensure_class_count_keys(current_objects_by_class)

            draw_hud_panel(frame, "VEHICLE ANALYTICS", [
                (f"Vehicles:     {total_vehicles}", C_WHITE),
                (f"Cars/Moto:    {class_wise_counts['car']}/{class_wise_counts['motorcycle']}", C_CYAN),
                (f"Bus/Truck:    {class_wise_counts['bus']}/{class_wise_counts['truck']}", C_CYAN),
                (f"Avg Speed:    {avg_speed} km/h", C_CYAN),
                (f"Max Speed:    {max_speed} km/h", C_RED if max_speed > SPEED_LIMIT_KMH else C_GREEN),
                (f"Violations:   {speeding_count}", C_RED if speeding_count > 0 else C_GREEN),
                (f"Crossed:      {len(crossed_ids)}", C_BLUE),
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

    if frame_num % window_frames != 0:
        volume_windows.append(window_count)

    if not os.path.isfile(out_p) or os.path.getsize(out_p) == 0:
        raise RuntimeError(f"Output missing or empty: {out_p}")

    unique_speeds = list(set(all_speeds))
    processing_time_sec = round(time.time() - t0, 2)
    duration_sec = round(frame_num / sfps, 2) if sfps else None
    speed_summaries = []
    class_wise_counts = ensure_class_count_keys({name: len(track_ids) for name, track_ids in class_track_ids.items()})
    class_wise_crossed_counts = ensure_class_count_keys({name: len(track_ids) for name, track_ids in class_crossed_ids.items()})
    current_objects_by_class_final = ensure_class_count_keys(current_objects_by_class)
    per_class_speed_stats = {
        name: {
            "avg_speed_kmh": round(float(np.mean(samples)), 1) if samples else 0.0,
            "max_speed_kmh": round(float(max(samples)), 1) if samples else 0.0,
            "samples": len(samples),
        }
        for name, samples in {
            vehicle_name: per_class_speed_samples.get(vehicle_name, [])
            for vehicle_name in DEFAULT_VEHICLE_CLASS_NAMES
        }.items()
    }

    for track_id, summary in sorted(track_summaries.items()):
        max_speed = round(float(summary["max_speed_kmh"]), 1)
        speed_samples = int(summary["speed_samples"])
        avg_speed = round(float(summary["speed_sum"]) / max(1, speed_samples), 1) if speed_samples else 0.0
        detected_speed = max_speed if max_speed > 0 else avg_speed
        is_overspeeding = detected_speed > SPEED_LIMIT_KMH
        object_type = normalize_vehicle_name(str(summary["object_type"]))
        speed_summaries.append(
            {
                "object_id": str(track_id),
                "object_type": object_type,
                "detected_speed_kmh": detected_speed,
                "speed_limit_kmh": SPEED_LIMIT_KMH,
                "is_overspeeding": is_overspeeding,
                "excess_speed_kmh": round(max(detected_speed - SPEED_LIMIT_KMH, 0.0), 1),
                "confidence_score": round(float(summary["confidence_sum"]) / max(1, int(summary["observations"])), 4),
                "status": "violation" if is_overspeeding else "normal",
                "notes": "detected_speed_kmh uses pixel-displacement calibration and is derived from tracked motion.",
                "crossed_line": bool(summary.get("crossed_line")),
                "class_count_for_type": class_wise_counts.get(object_type, 0),
                "direction": str(summary.get("direction") or "unknown"),
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
                    "crossed_line": bool(summary.get("crossed_line")),
                    "direction": str(summary.get("direction") or "unknown"),
                    "class_count_for_type": class_wise_counts.get(object_type, 0),
                },
            }
        )

    return {
        "output_video": out_p,
        "metrics": {
            "total_vehicles": total_vehicles,
            "class_wise_counts": class_wise_counts,
            "crossed_vehicle_count": len(crossed_ids),
            "class_wise_crossed_counts": class_wise_crossed_counts,
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
                "total_vehicles": total_vehicles,
                "class_wise_counts": class_wise_counts,
                "crossed_vehicle_count": len(crossed_ids),
                "class_wise_crossed_counts": class_wise_crossed_counts,
                "current_objects_by_class": current_objects_by_class_final,
                "per_class_speed_stats": per_class_speed_stats,
                "peak_volume_window": max(volume_windows) if volume_windows else 0,
            },
            "speed_summaries": speed_summaries,
        },
    }
