"""
People Counting — Pre-built Use Case
======================================
Count people in video frames with entry/exit tracking.

Industry Application:
    Retail: Footfall analytics — count customers entering/exiting stores.
    Manufacturing: Danger zone monitoring — alert if >N people enter restricted area.
    Events: Capacity management — monitor venue occupancy in real time.
"""

import os
import time
from collections import defaultdict

import cv2
import numpy as np

from use_cases.base import (
    FONT, C_RED, C_GREEN, C_YELLOW, C_WHITE, C_GRAY, C_BLUE, C_CYAN,
    auto_device, open_video, create_writer, build_output_path,
    load_model, draw_hud_panel, draw_alert_bar, draw_label,
)


PERSON_CLASS = 0
CAPACITY_THRESHOLD = 10  # trigger alert if more than N people


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
    """Process video for people counting."""
    device = device or auto_device()
    input_p = os.path.abspath(input_path)
    out_p = build_output_path(input_p, output_path, "_people_count")

    model = load_model(model_path)

    cap = open_video(input_p)
    fw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    fh = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    sfps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    writer = create_writer(out_p, sfps, fw, fh)

    # Counting line at middle of frame
    line_y = fh // 2
    seen_ids = set()
    crossed_up = set()
    crossed_down = set()
    prev_positions: dict[int, float] = {}

    frame_num = 0
    peak_count = 0
    count_history = []
    t0 = time.time()

    try:
        while cap.isOpened():
            ok, frame = cap.read()
            if not ok:
                break
            frame_num += 1

            try:
                results = model.track(
                    source=frame, classes=[PERSON_CLASS], conf=conf,
                    iou=0.70, device=device, persist=True, verbose=False
                )
            except Exception:
                writer.write(frame)
                continue

            current_count = 0

            if results and results[0].boxes is not None:
                det = results[0].boxes
                boxes = det.xyxy.cpu().numpy() if det.xyxy is not None and len(det.xyxy) > 0 else []
                tids = (det.id.cpu().numpy().astype(int).tolist()
                        if det.id is not None else list(range(len(boxes))))

                current_count = len(boxes)
                peak_count = max(peak_count, current_count)

                for i, bbox in enumerate(boxes):
                    x1, y1, x2, y2 = map(int, bbox)
                    tid = tids[i] if i < len(tids) else i
                    cy = (y1 + y2) // 2
                    cx = (x1 + x2) // 2
                    seen_ids.add(tid)

                    # Check line crossing
                    if tid in prev_positions:
                        prev_cy = prev_positions[tid]
                        if prev_cy < line_y <= cy and tid not in crossed_down:
                            crossed_down.add(tid)
                        elif prev_cy > line_y >= cy and tid not in crossed_up:
                            crossed_up.add(tid)
                    prev_positions[tid] = cy

                    # Draw person
                    color = C_GREEN if current_count <= CAPACITY_THRESHOLD else C_RED
                    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                    draw_label(frame, f"#{tid}", x1, y1, C_BLUE)

            count_history.append(current_count)

            # Draw counting line
            cv2.line(frame, (0, line_y), (fw, line_y), C_CYAN, 2, cv2.LINE_AA)
            cv2.putText(frame, "COUNTING LINE", (10, line_y - 8),
                        FONT, 0.35, C_CYAN, 1, cv2.LINE_AA)

            # Draw count display - large centered
            count_text = str(current_count)
            (tw, th), _ = cv2.getTextSize(count_text, FONT, 2.5, 4)
            cx_text = fw // 2 - tw // 2
            ov = frame.copy()
            cv2.rectangle(ov, (cx_text - 20, 10), (cx_text + tw + 20, th + 30), (0, 0, 0), -1)
            cv2.addWeighted(ov, 0.5, frame, 0.5, 0, frame)
            count_color = C_RED if current_count > CAPACITY_THRESHOLD else C_GREEN
            cv2.putText(frame, count_text, (cx_text, th + 18),
                        FONT, 2.5, count_color, 4, cv2.LINE_AA)

            # HUD
            fps_live = frame_num / max(1e-6, time.time() - t0)
            avg_occ = round(np.mean(count_history[-100:]), 1) if count_history else 0

            draw_hud_panel(frame, "PEOPLE COUNTER", [
                (f"Current:    {current_count}", C_WHITE),
                (f"Peak:       {peak_count}", C_CYAN),
                (f"Total Seen: {len(seen_ids)}", C_GREEN),
                (f"Crossed Up: {len(crossed_up)}", C_GREEN),
                (f"Crossed Dn: {len(crossed_down)}", C_YELLOW),
                (f"Avg Occ:    {avg_occ}", C_GRAY),
                (f"FPS:        {fps_live:.1f}", C_GRAY),
            ])

            if current_count > CAPACITY_THRESHOLD:
                draw_alert_bar(frame, f"  CAPACITY ALERT — {current_count} PEOPLE DETECTED (Limit: {CAPACITY_THRESHOLD})  ")

            writer.write(frame)

            if show:
                disp = cv2.resize(frame, (min(fw, 1280), min(fh, 720)))
                cv2.imshow("People Counting", disp)
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
            "total_count": len(seen_ids),
            "peak_count": peak_count,
            "avg_occupancy": round(np.mean(count_history), 1) if count_history else 0.0,
            "crossed_in": len(crossed_up),
            "crossed_out": len(crossed_down),
            "frames_analyzed": frame_num,
        },
    }
