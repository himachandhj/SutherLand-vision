"""
Fall Detection — Pre-built Use Case
=====================================
Detect falls using YOLOv8 pose estimation.

Industry Application:
    Healthcare / Elderly Care — detect patient falls for immediate caregiver alerts.
    Manufacturing — detect worker falls in industrial environments.
"""

import os
import time

import cv2
import numpy as np

from use_cases.base import (
    FONT, C_RED, C_GREEN, C_YELLOW, C_WHITE, C_GRAY, C_CYAN,
    auto_device, open_video, create_writer, build_output_path,
    load_model, draw_hud_panel, draw_alert_bar, draw_label,
)


PERSON_CLASS = 0
FALL_ASPECT_RATIO = 1.0  # width/height > 1 suggests horizontal (fallen)
FALL_SMOOTHING = 8


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
    device = device or auto_device()
    input_p = os.path.abspath(input_path)
    out_p = build_output_path(input_p, output_path, "_fall_detect")

    model = load_model(model_path)

    cap = open_video(input_p)
    fw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    fh = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    sfps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    writer = create_writer(out_p, sfps, fw, fh)

    fall_history: dict[int, list[bool]] = {}
    total_falls = 0
    seen_ids = set()
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
                    source=frame, classes=[PERSON_CLASS], conf=conf,
                    iou=0.70, device=device, persist=True, verbose=False
                )
            except Exception:
                writer.write(frame)
                continue

            active_falls = 0

            if results and results[0].boxes is not None:
                det = results[0].boxes
                boxes = det.xyxy.cpu().numpy() if det.xyxy is not None and len(det.xyxy) > 0 else []
                tids = (det.id.cpu().numpy().astype(int).tolist()
                        if det.id is not None else list(range(len(boxes))))

                for i, bbox in enumerate(boxes):
                    x1, y1, x2, y2 = map(int, bbox)
                    tid = tids[i] if i < len(tids) else i
                    seen_ids.add(tid)
                    bw = max(1, x2 - x1)
                    bh = max(1, y2 - y1)
                    aspect = bw / bh
                    bottom_y = y2 / fh

                    is_fallen = aspect > FALL_ASPECT_RATIO and bottom_y > 0.5

                    if tid not in fall_history:
                        fall_history[tid] = []
                    fall_history[tid].append(is_fallen)
                    if len(fall_history[tid]) > FALL_SMOOTHING * 2:
                        fall_history[tid] = fall_history[tid][-FALL_SMOOTHING * 2:]

                    recent = fall_history[tid][-FALL_SMOOTHING:]
                    confirmed_fall = sum(recent) >= FALL_SMOOTHING * 0.6

                    if confirmed_fall:
                        active_falls += 1
                        total_falls += 1
                        cv2.rectangle(frame, (x1, y1), (x2, y2), C_RED, 3)
                        draw_label(frame, f"#{tid} FALL DETECTED", x1, y1, C_RED)
                    else:
                        cv2.rectangle(frame, (x1, y1), (x2, y2), C_GREEN, 2)
                        draw_label(frame, f"#{tid}", x1, y1, C_GREEN)

            fps_live = frame_num / max(1e-6, time.time() - t0)
            draw_hud_panel(frame, "FALL MONITOR", [
                (f"Persons:    {len(seen_ids)}", C_WHITE),
                (f"Falls:      {total_falls}", C_RED if total_falls > 0 else C_GREEN),
                (f"Active:     {active_falls}", C_RED if active_falls > 0 else C_GREEN),
                (f"FPS:        {fps_live:.1f}", C_GRAY),
            ])

            if active_falls > 0:
                draw_alert_bar(frame, "  FALL DETECTED — IMMEDIATE ASSISTANCE REQUIRED  ")

            writer.write(frame)

            if show:
                disp = cv2.resize(frame, (min(fw, 1280), min(fh, 720)))
                cv2.imshow("Fall Detection", disp)
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
            "total_falls": total_falls,
            "total_persons_monitored": len(seen_ids),
            "avg_response_window_sec": round(FALL_SMOOTHING / sfps, 2),
            "frames_analyzed": frame_num,
        },
    }
