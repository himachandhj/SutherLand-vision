"""
Object Tracking — Pre-built Use Case
======================================
Multi-object tracking across video frames using YOLOv8.

Industry Application:
    Retail loss prevention — track suspicious individuals across camera feeds.
    Airport/venue perimeter monitoring — track persons of interest.
    Manufacturing — track worker movements for efficiency analysis.
"""

import os
import time
from datetime import datetime, timezone

import cv2
import numpy as np

from use_cases.base import (
    FONT, C_RED, C_GREEN, C_YELLOW, C_WHITE, C_GRAY, C_BLUE, C_CYAN,
    auto_device, open_video, create_writer, build_output_path,
    load_model, draw_hud_panel, draw_label, extract_detection_payload, run_tracking_inference,
)


# Track colors - rotate through for different track IDs
TRACK_COLORS = [
    (230, 160, 50),   # blue
    (50, 200, 50),    # green
    (0, 200, 230),    # yellow
    (200, 50, 200),   # purple
    (50, 200, 200),   # cyan
    (50, 50, 230),    # red
    (200, 200, 50),   # teal
    (100, 50, 200),   # dark red
]


class TrackState:
    """Per-object tracking state."""

    def __init__(self, track_id: int, class_name: str):
        self.track_id = track_id
        self.class_name = class_name
        self.positions: list[tuple[int, int]] = []
        self.zone_history: list[str] = []
        self.first_frame = 0
        self.last_frame = 0
        self.confidence_sum = 0.0
        self.confidence_max = 0.0
        self.observations = 0

    def update(self, cx: int, cy: int, frame_num: int, confidence: float, zone_label: str):
        self.positions.append((cx, cy))
        if len(self.positions) > 60:
            self.positions = self.positions[-60:]
        if not self.zone_history or self.zone_history[-1] != zone_label:
            self.zone_history.append(zone_label)
            if len(self.zone_history) > 12:
                self.zone_history = self.zone_history[-12:]
        if self.first_frame == 0:
            self.first_frame = frame_num
        self.last_frame = frame_num
        self.confidence_sum += confidence
        self.confidence_max = max(self.confidence_max, confidence)
        self.observations += 1

    @property
    def duration_frames(self) -> int:
        return self.last_frame - self.first_frame

    @property
    def color(self):
        return TRACK_COLORS[self.track_id % len(TRACK_COLORS)]

    @property
    def avg_confidence(self) -> float:
        return self.confidence_sum / max(1, self.observations)


def _motion_zone_label(cx: int, fw: int) -> str:
    if cx < fw / 3:
        return "left"
    if cx < (2 * fw) / 3:
        return "center"
    return "right"


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
    """Process video for multi-object tracking."""
    device = device or auto_device()
    input_p = os.path.abspath(input_path)
    out_p = build_output_path(input_p, output_path, "_tracking")

    model = load_model(model_path)

    cap = open_video(input_p)
    fw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    fh = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    sfps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    writer = create_writer(out_p, sfps, fw, fh)

    tracks: dict[int, TrackState] = {}
    frame_num = 0
    timeout = int(sfps * 3.0)
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
                    conf=conf,
                    iou=0.70,
                    device=device,
                )
            except Exception:
                writer.write(frame)
                continue

            boxes, tids, class_ids, confs, names = extract_detection_payload(results)

            for i, bbox in enumerate(boxes):
                x1, y1, x2, y2 = map(int, bbox)
                tid = tids[i] if i < len(tids) else i
                cls_id = class_ids[i] if i < len(class_ids) else 0
                conf_score = float(confs[i]) if i < len(confs) else 1.0
                cls_name = names.get(cls_id, str(cls_id))
                cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
                zone_label = _motion_zone_label(cx, fw)

                if tid not in tracks:
                    tracks[tid] = TrackState(tid, cls_name)
                tracks[tid].update(cx, cy, frame_num, conf_score, zone_label)

                color = tracks[tid].color

                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                draw_label(frame, f"#{tid} {cls_name}", x1, y1, color)

                pts = tracks[tid].positions
                for j in range(1, len(pts)):
                    alpha = j / len(pts)
                    thickness = max(1, int(alpha * 3))
                    cv2.line(frame, pts[j - 1], pts[j], color, thickness, cv2.LINE_AA)

            # HUD
            active = {tid: t for tid, t in tracks.items() if frame_num - t.last_frame <= timeout}
            fps_live = frame_num / max(1e-6, time.time() - t0)
            total_unique = len(set(t.track_id for t in tracks.values()))

            draw_hud_panel(frame, "OBJECT TRACKER", [
                (f"Active:     {len(active)}", C_WHITE),
                (f"Total:      {total_unique}", C_CYAN),
                (f"Frame:      {frame_num}/{total_frames}", C_GRAY),
                (f"FPS:        {fps_live:.1f}", C_GRAY),
            ])

            writer.write(frame)

            if show:
                disp = cv2.resize(frame, (min(fw, 1280), min(fh, 720)))
                cv2.imshow("Object Tracking", disp)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break

    finally:
        cap.release()
        writer.release()
        if show:
            cv2.destroyAllWindows()

    if not os.path.isfile(out_p) or os.path.getsize(out_p) == 0:
        raise RuntimeError(f"Output missing or empty: {out_p}")

    all_durations = [t.duration_frames / sfps for t in tracks.values() if t.duration_frames > 0]
    processing_time_sec = round(time.time() - t0, 2)
    duration_sec = round(frame_num / sfps, 2) if sfps else None
    track_summaries = []
    anomaly_duration_threshold = 15.0

    for track in sorted(tracks.values(), key=lambda item: item.track_id):
        entry_time = round(track.first_frame / sfps, 2) if sfps else None
        exit_time = round(track.last_frame / sfps, 2) if sfps else None
        duration_in_zone_sec = round(track.duration_frames / sfps, 2) if sfps else None
        path_sequence = " -> ".join(track.zone_history) if track.zone_history else ""
        next_zone = track.zone_history[1] if len(track.zone_history) > 1 else None
        is_anomaly = bool(
            (duration_in_zone_sec or 0.0) >= anomaly_duration_threshold
            or len(track.zone_history) >= 4
        )
        track_summaries.append(
            {
                "object_id": str(track.track_id),
                "object_type": str(track.class_name),
                "entry_time": entry_time,
                "exit_time": exit_time,
                "duration_in_zone_sec": duration_in_zone_sec,
                "next_zone": next_zone,
                "path_sequence": path_sequence,
                "is_anomaly": is_anomaly,
                "confidence_score": round(track.avg_confidence, 4),
                "status": "anomaly" if is_anomaly else "normal",
                "notes": "path_sequence and next_zone are derived from coarse left/center/right movement zones.",
                "metadata": {
                    "first_seen_frame": track.first_frame,
                    "last_seen_frame": track.last_frame,
                    "observations": track.observations,
                    "max_confidence": round(track.confidence_max, 4),
                },
            }
        )

    return {
        "output_video": out_p,
        "metrics": {
            "total_tracked": len(tracks),
            "unique_objects": len(set(t.track_id for t in tracks.values())),
            "frames_analyzed": frame_num,
            "avg_track_duration": round(np.mean(all_durations), 1) if all_durations else 0.0,
            "processing_time_sec": processing_time_sec,
            "video_duration_sec": duration_sec,
            "event_rows_generated": len(track_summaries),
        },
        "analytics": {
            "video_summary": {
                "frame_count": frame_num,
                "fps": round(float(sfps), 2) if sfps else None,
                "duration_sec": duration_sec,
                "processing_time_sec": processing_time_sec,
                "simulated_timestamp": datetime.now(timezone.utc).isoformat(),
            },
            "track_summaries": track_summaries,
        },
    }
