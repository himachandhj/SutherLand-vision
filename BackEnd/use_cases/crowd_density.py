"""
Crowd Density Estimation — Pre-built Use Case
==============================================
Monitors crowd density in public spaces, venues, and transit hubs using
YOLOv8 person detection with density zoning.

Industry Application:
    Stadium operators, mall managers, and city administrations use crowd
    density monitoring to prevent overcrowding, manage egress, and ensure
    safety compliance at public gatherings.
"""

from __future__ import annotations

import os
import time

import cv2
import numpy as np

from use_cases.base import (
    FONT, C_RED, C_ORANGE, C_YELLOW, C_WHITE, C_GREEN, C_GRAY, C_BLUE,
    auto_device, open_video, create_writer, build_output_path,
    load_model, draw_hud_panel, draw_alert_bar, draw_label,
)

# Density thresholds (people per 100x100 pixel cell)
DENSITY_LOW    = 2   # green — comfortable
DENSITY_MEDIUM = 5   # yellow — crowded
DENSITY_HIGH   = 8   # red — overcrowded


def _density_color(density: float):
    if density >= DENSITY_HIGH:
        return C_RED
    if density >= DENSITY_MEDIUM:
        return C_ORANGE
    return C_GREEN


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
    Process video for crowd density estimation.

    Returns dict with output_video path and metrics:
        peak_count, avg_density, overcrowding_alerts, frames_analyzed
    """
    device = device or auto_device()
    input_p = os.path.abspath(input_path)
    out_p = build_output_path(input_p, output_path, "_crowd_density")

    model = load_model(model_path)

    cap = open_video(input_p)
    fw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    fh = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    sfps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    writer = create_writer(out_p, sfps, fw, fh)

    frame_num = 0
    peak_count = 0
    total_count_sum = 0
    overcrowding_alerts = 0
    t0 = time.time()

    try:
        while cap.isOpened():
            ok, frame = cap.read()
            if not ok:
                break
            frame_num += 1

            results = model(frame, classes=[0], conf=conf, verbose=False, device=device)
            boxes = []
            if results and results[0].boxes is not None:
                boxes = results[0].boxes.xyxy.cpu().numpy().tolist()

            count = len(boxes)
            peak_count = max(peak_count, count)
            total_count_sum += count

            # Compute density per grid cell (200x200 px)
            cell_w, cell_h = 200, 200
            density_map: dict[tuple, int] = {}
            for box in boxes:
                x1, y1, x2, y2 = box
                cx, cy = int((x1 + x2) / 2), int((y1 + y2) / 2)
                cell = (cx // cell_w, cy // cell_h)
                density_map[cell] = density_map.get(cell, 0) + 1
                # Draw person box
                col = _density_color(density_map[cell])
                cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), col, 2)

            max_cell_density = max(density_map.values()) if density_map else 0
            is_overcrowded = max_cell_density >= DENSITY_HIGH

            if is_overcrowded:
                overcrowding_alerts += 1

            fps_live = frame_num / max(1e-6, time.time() - t0)
            density_label = "HIGH" if max_cell_density >= DENSITY_HIGH else ("MEDIUM" if max_cell_density >= DENSITY_MEDIUM else "LOW")
            density_color = _density_color(max_cell_density)

            draw_hud_panel(frame, "CROWD DENSITY MONITOR", [
                (f"People:       {count}", C_WHITE),
                (f"Peak Count:   {peak_count}", C_WHITE),
                (f"Density:      {density_label}", density_color),
                (f"Alerts:       {overcrowding_alerts}", C_RED if overcrowding_alerts > 0 else C_GREEN),
                (f"FPS:          {fps_live:.1f}", C_GRAY),
            ])

            if is_overcrowded:
                draw_alert_bar(frame, f"  OVERCROWDING DETECTED — {count} PEOPLE IN ZONE  ")

            writer.write(frame)

            if show:
                disp = cv2.resize(frame, (min(fw, 1280), min(fh, 720)))
                cv2.imshow("Crowd Density", disp)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break

    finally:
        cap.release()
        writer.release()
        if show:
            cv2.destroyAllWindows()

    if not os.path.isfile(out_p) or os.path.getsize(out_p) == 0:
        raise RuntimeError(f"Output missing or empty: {out_p}")

    avg_density = round(total_count_sum / max(1, frame_num), 2)

    return {
        "output_video": out_p,
        "metrics": {
            "peak_count": peak_count,
            "avg_density": avg_density,
            "overcrowding_alerts": overcrowding_alerts,
            "frames_analyzed": frame_num,
        },
    }
