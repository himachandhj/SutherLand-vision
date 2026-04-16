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

import cv2
import numpy as np

from use_cases.base import (
    FONT, C_RED, C_GREEN, C_YELLOW, C_WHITE, C_GRAY, C_BLUE, C_CYAN, C_ORANGE,
    auto_device, open_video, create_writer, build_output_path,
    load_model, draw_hud_panel, draw_label,
)


# COCO vehicle classes
VEHICLE_CLASSES = [2, 3, 5, 7]
VEHICLE_NAMES = {2: "Car", 3: "Motorcycle", 5: "Bus", 7: "Truck"}
VEHICLE_COLORS = {2: C_GREEN, 3: C_YELLOW, 5: C_BLUE, 7: C_ORANGE}


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

    frame_num = 0
    t0 = time.time()

    try:
        while cap.isOpened():
            ok, frame = cap.read()
            if not ok:
                break
            frame_num += 1

            try:
                results = model.track(
                    source=frame, classes=VEHICLE_CLASSES, conf=conf,
                    iou=0.70, device=device, persist=True, verbose=False
                )
            except Exception:
                writer.write(frame)
                continue

            frame_count = 0

            if results and results[0].boxes is not None:
                det = results[0].boxes
                boxes = det.xyxy.cpu().numpy() if det.xyxy is not None and len(det.xyxy) > 0 else []
                tids = (det.id.cpu().numpy().astype(int).tolist()
                        if det.id is not None else list(range(len(boxes))))
                class_ids = det.cls.cpu().numpy().astype(int).tolist() if det.cls is not None else []

                frame_count = len(boxes)

                for i, bbox in enumerate(boxes):
                    x1, y1, x2, y2 = map(int, bbox)
                    tid = tids[i] if i < len(tids) else i
                    cls_id = class_ids[i] if i < len(class_ids) else 2
                    veh_name = VEHICLE_NAMES.get(cls_id, "Vehicle")
                    color = VEHICLE_COLORS.get(cls_id, C_GREEN)

                    # Count unique vehicles
                    if tid not in seen_ids:
                        seen_ids[tid] = veh_name
                        class_counts[veh_name] += 1

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

    return {
        "output_video": out_p,
        "metrics": {
            "total_vehicles": sum(class_counts.values()),
            "cars": class_counts.get("Car", 0),
            "trucks": class_counts.get("Truck", 0),
            "buses": class_counts.get("Bus", 0),
            "motorcycles": class_counts.get("Motorcycle", 0),
            "frames_analyzed": frame_num,
        },
    }
