"""
Object Counting — Pre-built Use Case
=====================================
Count unique objects moving through a scene using generic YOLOv8 tracking.
"""

from __future__ import annotations

import os
import time

import cv2

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
    draw_hud_panel,
    draw_label,
    load_model,
    open_video,
)


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
    """Process video for generic object counting."""
    device = device or auto_device()
    input_p = os.path.abspath(input_path)
    out_p = build_output_path(input_p, output_path, "_object_count")

    model = load_model(model_path)

    cap = open_video(input_p)
    fw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    fh = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    sfps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    writer = create_writer(out_p, sfps, fw, fh)

    line_x = fw // 2
    frame_num = 0
    seen_ids = set()
    crossed_ids = set()
    prev_positions: dict[int, float] = {}
    volume_windows: list[int] = []
    window_count = 0
    window_frames = max(1, int(sfps * 60))
    t0 = time.time()

    try:
        while cap.isOpened():
            ok, frame = cap.read()
            if not ok:
                break
            frame_num += 1

            try:
                results = model.track(
                    source=frame,
                    conf=conf,
                    iou=0.70,
                    device=device,
                    persist=True,
                    verbose=False,
                )
            except Exception:
                writer.write(frame)
                continue

            objects_in_frame = 0

            if results and results[0].boxes is not None:
                det = results[0].boxes
                boxes = det.xyxy.cpu().numpy() if det.xyxy is not None and len(det.xyxy) > 0 else []
                tids = det.id.cpu().numpy().astype(int).tolist() if det.id is not None else list(range(len(boxes)))
                class_ids = det.cls.cpu().numpy().astype(int).tolist() if det.cls is not None else []
                names = results[0].names

                objects_in_frame = len(boxes)

                for i, bbox in enumerate(boxes):
                    x1, y1, x2, y2 = map(int, bbox)
                    tid = tids[i] if i < len(tids) else i
                    cls_id = class_ids[i] if i < len(class_ids) else 0
                    cls_name = names.get(cls_id, str(cls_id))
                    cx = (x1 + x2) // 2
                    cy = (y1 + y2) // 2
                    seen_ids.add(tid)

                    if tid in prev_positions:
                        prev_x = prev_positions[tid]
                        if prev_x < line_x <= cx and tid not in crossed_ids:
                            crossed_ids.add(tid)
                            window_count += 1
                    prev_positions[tid] = cx

                    cv2.rectangle(frame, (x1, y1), (x2, y2), C_BLUE, 2)
                    draw_label(frame, f"#{tid} {cls_name}", x1, y1, C_BLUE)

            if frame_num % window_frames == 0:
                volume_windows.append(window_count)
                window_count = 0

            cv2.line(frame, (line_x, 0), (line_x, fh), C_CYAN, 2, cv2.LINE_AA)
            cv2.putText(frame, "COUNT LINE", (line_x + 10, 30), FONT, 0.5, C_CYAN, 2, cv2.LINE_AA)

            duration_minutes = max(frame_num / sfps / 60.0, 1 / 60.0)
            current_rate = len(crossed_ids) / duration_minutes
            peak_window = max(volume_windows + [window_count]) if (volume_windows or window_count) else 0
            target_progress = min(100.0, len(crossed_ids) / 120.0 * 100.0)
            fps_live = frame_num / max(1e-6, time.time() - t0)

            draw_hud_panel(frame, "OBJECT COUNTING", [
                (f"Counted:      {len(crossed_ids)}", C_WHITE),
                (f"In Frame:     {objects_in_frame}", C_CYAN),
                (f"Rate/min:     {current_rate:.1f}", C_GREEN),
                (f"Peak Window:  {peak_window}", C_BLUE),
                (f"Target:       {target_progress:.0f}%", C_RED if target_progress < 60 else C_GREEN),
                (f"FPS:          {fps_live:.1f}", C_GRAY),
            ])

            writer.write(frame)

            if show:
                disp = cv2.resize(frame, (min(fw, 1280), min(fh, 720)))
                cv2.imshow("Object Counting", disp)
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

    duration_minutes = max(frame_num / sfps / 60.0, 1 / 60.0)
    return {
        "output_video": out_p,
        "metrics": {
            "total_objects": len(crossed_ids),
            "current_rate_per_min": round(len(crossed_ids) / duration_minutes, 1),
            "peak_volume_window": max(volume_windows) if volume_windows else 0,
            "target_progress_pct": round(min(100.0, len(crossed_ids) / 120.0 * 100.0), 1),
            "frames_analyzed": frame_num,
        },
    }
