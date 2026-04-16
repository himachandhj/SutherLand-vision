"""
Queue Management — Pre-built Use Case
======================================
Estimate queue build-up and dwell time using person tracking in a default queue zone.
"""

from __future__ import annotations

import os
import time

import cv2
import numpy as np

from use_cases.base import (
    C_BLUE,
    C_CYAN,
    C_GRAY,
    C_GREEN,
    C_RED,
    C_WHITE,
    FONT,
    auto_device,
    build_output_path,
    create_writer,
    draw_alert_bar,
    draw_hud_panel,
    draw_label,
    load_model,
    open_video,
)


PERSON_CLASS = 0


def _queue_region(fw: int, fh: int) -> np.ndarray:
    return np.array([
        [int(fw * 0.58), int(fh * 0.14)],
        [int(fw * 0.92), int(fh * 0.14)],
        [int(fw * 0.92), int(fh * 0.92)],
        [int(fw * 0.58), int(fh * 0.92)],
    ], dtype=np.int32)


def _inside_queue(x: int, y: int, polygon: np.ndarray) -> bool:
    return cv2.pointPolygonTest(polygon, (float(x), float(y)), False) >= 0


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
    """Process video for queue management."""
    device = device or auto_device()
    input_p = os.path.abspath(input_path)
    out_p = build_output_path(input_p, output_path, "_queue")

    model = load_model(model_path)

    cap = open_video(input_p)
    fw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    fh = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    sfps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    writer = create_writer(out_p, sfps, fw, fh)

    queue_zone = _queue_region(fw, fh)
    service_line_y = int(fh * 0.22)
    frame_num = 0
    max_queue_length = 0
    queue_history: list[int] = []
    enter_frames: dict[int, int] = {}
    last_positions: dict[int, tuple[int, int]] = {}
    completed_waits: list[float] = []
    service_abandonment = 0
    previous_active = set()
    t0 = time.time()

    try:
        while cap.isOpened():
            ok, frame = cap.read()
            if not ok:
                break
            frame_num += 1

            overlay = frame.copy()
            cv2.fillPoly(overlay, [queue_zone], (39, 35, 92))
            cv2.addWeighted(overlay, 0.12, frame, 0.88, 0, frame)
            cv2.polylines(frame, [queue_zone], True, C_BLUE, 2, cv2.LINE_AA)
            cv2.line(frame, (queue_zone[0][0], service_line_y), (queue_zone[1][0], service_line_y), C_CYAN, 2, cv2.LINE_AA)
            cv2.putText(frame, "QUEUE ZONE", (queue_zone[0][0] + 8, queue_zone[0][1] + 24), FONT, 0.5, C_BLUE, 2, cv2.LINE_AA)

            try:
                results = model.track(
                    source=frame,
                    classes=[PERSON_CLASS],
                    conf=conf,
                    iou=0.70,
                    device=device,
                    persist=True,
                    verbose=False,
                )
            except Exception:
                writer.write(frame)
                continue

            active_ids = set()
            queue_count = 0

            if results and results[0].boxes is not None:
                det = results[0].boxes
                boxes = det.xyxy.cpu().numpy() if det.xyxy is not None and len(det.xyxy) > 0 else []
                tids = det.id.cpu().numpy().astype(int).tolist() if det.id is not None else list(range(len(boxes)))

                for i, bbox in enumerate(boxes):
                    x1, y1, x2, y2 = map(int, bbox)
                    tid = tids[i] if i < len(tids) else i
                    cx = (x1 + x2) // 2
                    cy = y2
                    active_ids.add(tid)

                    in_queue = _inside_queue(cx, cy, queue_zone)
                    if in_queue:
                        queue_count += 1
                        if tid not in enter_frames:
                            enter_frames[tid] = frame_num
                        last_positions[tid] = (cx, cy)
                        cv2.rectangle(frame, (x1, y1), (x2, y2), C_BLUE, 2)
                        draw_label(frame, f"#{tid} queued", x1, y1, C_BLUE)
                    else:
                        cv2.rectangle(frame, (x1, y1), (x2, y2), C_GREEN, 2)
                        draw_label(frame, f"#{tid}", x1, y1, C_GREEN)

            departed = previous_active - active_ids
            for tid in departed:
                if tid not in enter_frames:
                    continue
                wait_minutes = max(0.0, (frame_num - enter_frames[tid]) / sfps / 60.0)
                last_pos = last_positions.get(tid)
                if last_pos and last_pos[1] > service_line_y:
                    service_abandonment += 1
                else:
                    completed_waits.append(wait_minutes)
                enter_frames.pop(tid, None)
                last_positions.pop(tid, None)

            previous_active = active_ids
            queue_history.append(queue_count)
            max_queue_length = max(max_queue_length, queue_count)

            avg_wait = np.mean(completed_waits) if completed_waits else 0.0
            fps_live = frame_num / max(1e-6, time.time() - t0)

            draw_hud_panel(frame, "QUEUE MANAGEMENT", [
                (f"Current Queue: {queue_count}", C_WHITE),
                (f"Avg Wait:      {avg_wait:.1f} min", C_CYAN),
                (f"Max Queue:      {max_queue_length}", C_BLUE),
                (f"Abandonments:   {service_abandonment}", C_RED if service_abandonment > 0 else C_GREEN),
                (f"FPS:           {fps_live:.1f}", C_GRAY),
            ])

            if queue_count >= 6:
                draw_alert_bar(frame, f"  QUEUE BUILD-UP DETECTED — {queue_count} PEOPLE WAITING  ")

            writer.write(frame)

            if show:
                disp = cv2.resize(frame, (min(fw, 1280), min(fh, 720)))
                cv2.imshow("Queue Management", disp)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break

    finally:
        cap.release()
        writer.release()
        if show:
            cv2.destroyAllWindows()

    if not os.path.isfile(out_p) or os.path.getsize(out_p) == 0:
        raise RuntimeError(f"Output missing or empty: {out_p}")

    current_queue_length = queue_history[-1] if queue_history else 0
    average_wait = np.mean(completed_waits) if completed_waits else 0.0

    return {
        "output_video": out_p,
        "metrics": {
            "current_queue_length": current_queue_length,
            "average_wait_time_min": round(float(average_wait), 1),
            "max_queue_length": max_queue_length,
            "service_abandonment": service_abandonment,
            "frames_analyzed": frame_num,
        },
    }
