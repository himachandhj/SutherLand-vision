"""
Vehicle Counting & Classification — Pre-built Use Case
========================================================
Count and classify vehicles (car, truck, bus, motorcycle) in traffic footage.

Industry Application:
    Highway toll analytics — count and classify vehicles for billing and planning.
    Traffic engineering — measure traffic volume and composition for road design.
    Smart city — real-time traffic flow monitoring at intersections.
"""

import os
import time
from collections import defaultdict
from datetime import datetime, timezone

import cv2
import numpy as np

from use_cases.base import (
    FONT, C_RED, C_GREEN, C_YELLOW, C_WHITE, C_GRAY, C_BLUE, C_CYAN, C_ORANGE,
    auto_device, open_video, create_writer, build_output_path,
    load_model, draw_hud_panel, draw_label, extract_detection_payload, run_tracking_inference,
)


# COCO vehicle classes
VEHICLE_CLASSES = [2, 3, 5, 7]
VEHICLE_NAMES = {2: "Car", 3: "Motorcycle", 5: "Bus", 7: "Truck"}
VEHICLE_COLORS = {2: C_GREEN, 3: C_YELLOW, 5: C_BLUE, 7: C_ORANGE}
EXPECTED_COUNTS = {"Car": 10, "Motorcycle": 4, "Bus": 2, "Truck": 3}


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
    """Process video for vehicle counting and classification."""
    device = device or auto_device()
    input_p = os.path.abspath(input_path)
    out_p = build_output_path(input_p, output_path, "_vehicle_count")

    model = load_model(model_path)

    cap = open_video(input_p)
    fw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    fh = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    sfps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    writer = create_writer(out_p, sfps, fw, fh)

    seen_ids: dict[int, str] = {}  # tid -> class name
    class_counts: dict[str, int] = defaultdict(int)
    class_confidences: dict[str, list[float]] = defaultdict(list)
    peak_objects_in_frame = 0

    frame_num = 0
    t0 = time.time()

    try:
        while cap.isOpened():
            ok, frame = cap.read()
            if not ok:
                break
            frame_num += 1

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

            frame_count = 0

            boxes, tids, class_ids, confs, _ = extract_detection_payload(results)
            frame_count = len(boxes)
            peak_objects_in_frame = max(peak_objects_in_frame, frame_count)

            for i, bbox in enumerate(boxes):
                x1, y1, x2, y2 = map(int, bbox)
                tid = tids[i] if i < len(tids) else i
                cls_id = class_ids[i] if i < len(class_ids) else 2
                conf_score = float(confs[i]) if i < len(confs) else 1.0
                veh_name = VEHICLE_NAMES.get(cls_id, "Vehicle")
                color = VEHICLE_COLORS.get(cls_id, C_GREEN)

                if tid not in seen_ids:
                    seen_ids[tid] = veh_name
                    class_counts[veh_name] += 1
                class_confidences[veh_name].append(conf_score)

                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                draw_label(frame, f"#{tid} {veh_name}", x1, y1, color)

            # Draw class breakdown panel on left side
            total = sum(class_counts.values())
            breakdown_lines = [(f"Total:       {total}", C_WHITE)]
            for veh_name in ["Car", "Motorcycle", "Bus", "Truck"]:
                count = class_counts.get(veh_name, 0)
                pct = f" ({count/total*100:.0f}%)" if total > 0 else ""
                breakdown_lines.append((f"{veh_name + ':':<13}{count}{pct}", VEHICLE_COLORS.get(
                    {v: k for k, v in VEHICLE_NAMES.items()}.get(veh_name, 2), C_GRAY)))

            fps_live = frame_num / max(1e-6, time.time() - t0)
            breakdown_lines.append((f"In Frame:    {frame_count}", C_GRAY))
            breakdown_lines.append((f"FPS:         {fps_live:.1f}", C_GRAY))

            draw_hud_panel(frame, "VEHICLE COUNTER", breakdown_lines)

            writer.write(frame)

            if show:
                disp = cv2.resize(frame, (min(fw, 1280), min(fh, 720)))
                cv2.imshow("Vehicle Counting", disp)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break

    finally:
        cap.release()
        writer.release()
        if show:
            cv2.destroyAllWindows()

    if not os.path.isfile(out_p) or os.path.getsize(out_p) == 0:
        raise RuntimeError(f"Output missing or empty: {out_p}")

    total_objects = sum(class_counts.values())
    processing_time_sec = round(time.time() - t0, 2)
    duration_sec = round(frame_num / sfps, 2) if sfps else None
    class_summaries = []
    for veh_name in ["Car", "Motorcycle", "Bus", "Truck"]:
        class_count = class_counts.get(veh_name, 0)
        if class_count == 0 and veh_name not in class_confidences:
            continue
        expected_count = EXPECTED_COUNTS.get(veh_name, 5)
        class_summaries.append(
            {
                "class_name": veh_name,
                "class_count": class_count,
                "expected_count": expected_count,
                "count_difference": class_count - expected_count,
                "total_objects_in_frame": total_objects,
                "class_percentage": round((class_count / max(total_objects, 1)) * 100.0, 1),
                "confidence_score": round(float(np.mean(class_confidences.get(veh_name, [0.0]))), 4),
                "status": "matched" if class_count == expected_count else ("above_expected" if class_count > expected_count else "below_expected"),
                "notes": "expected_count is a configurable default baseline and class_percentage is derived from total unique objects counted in the run.",
                "metadata": {
                    "peak_objects_in_frame": peak_objects_in_frame,
                    "frames_analyzed": frame_num,
                },
            }
        )

    return {
        "output_video": out_p,
        "metrics": {
            "total_vehicles": total_objects,
            "cars": class_counts.get("Car", 0),
            "trucks": class_counts.get("Truck", 0),
            "buses": class_counts.get("Bus", 0),
            "motorcycles": class_counts.get("Motorcycle", 0),
            "frames_analyzed": frame_num,
            "processing_time_sec": processing_time_sec,
            "video_duration_sec": duration_sec,
            "peak_objects_in_frame": peak_objects_in_frame,
            "event_rows_generated": len(class_summaries),
        },
        "analytics": {
            "video_summary": {
                "frame_count": frame_num,
                "fps": round(float(sfps), 2) if sfps else None,
                "duration_sec": duration_sec,
                "processing_time_sec": processing_time_sec,
                "simulated_timestamp": datetime.now(timezone.utc).isoformat(),
                "total_objects_counted": total_objects,
                "peak_objects_in_frame": peak_objects_in_frame,
            },
            "class_summaries": class_summaries,
        },
    }
