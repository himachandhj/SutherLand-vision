"""
Zone Intrusion Detection — Pre-built Use Case
===============================================
Detect unauthorized entry into predefined restricted zones.

Industry Application:
    Data center security — detect unauthorized access to server rooms.
    Warehouse — restrict access to hazardous material storage areas.
    Manufacturing — danger zone monitoring, alert if workers enter unsafe zones.
    Construction — perimeter breach detection.
"""

import os
import time
from datetime import datetime, timezone

import cv2
import numpy as np

from use_cases.base import (
    FONT, C_RED, C_GREEN, C_YELLOW, C_WHITE, C_GRAY, C_BLUE, C_CYAN,
    auto_device, open_video, create_writer, build_output_path,
    load_model, draw_hud_panel, draw_alert_bar, draw_label,
)


PERSON_CLASS = 0


def create_default_zone(fw: int, fh: int) -> np.ndarray:
    """Create a default restricted zone polygon (center rectangle)."""
    margin_x = int(fw * 0.25)
    margin_y = int(fh * 0.25)
    return np.array([
        [margin_x, margin_y],
        [fw - margin_x, margin_y],
        [fw - margin_x, fh - margin_y],
        [margin_x, fh - margin_y],
    ], dtype=np.int32)


def point_in_polygon(px: int, py: int, polygon: np.ndarray) -> bool:
    """Check if a point is inside a polygon."""
    return cv2.pointPolygonTest(polygon, (float(px), float(py)), False) >= 0


def _extract_person_detections(results) -> tuple[list, list[int], list[float]]:
    if not results or results[0].boxes is None:
        return [], [], []

    det = results[0].boxes
    if det.xyxy is None or len(det.xyxy) == 0:
        return [], [], []

    boxes = det.xyxy.cpu().numpy()
    tids = (
        det.id.cpu().numpy().astype(int).tolist()
        if det.id is not None else list(range(len(boxes)))
    )
    confs = (
        det.conf.cpu().numpy().tolist()
        if det.conf is not None else [1.0] * len(boxes)
    )
    return boxes, tids, confs


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
    """Process video for zone intrusion detection."""
    device = device or auto_device()
    input_p = os.path.abspath(input_path)
    out_p = build_output_path(input_p, output_path, "_zone_intrusion")

    model = load_model(model_path)

    cap = open_video(input_p)
    fw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    fh = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    sfps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    writer = create_writer(out_p, sfps, fw, fh)

    # Define restricted zone
    zone = create_default_zone(fw, fh)

    seen_intruders = set()
    total_intrusions = 0
    peak_zone_occupancy = 0
    frame_num = 0
    t0 = time.time()
    intrusion_events: dict[int, dict[str, float | int | str]] = {}

    try:
        while cap.isOpened():
            ok, frame = cap.read()
            if not ok:
                break
            frame_num += 1

            # Draw restricted zone
            overlay = frame.copy()
            cv2.fillPoly(overlay, [zone], (0, 0, 80))
            cv2.addWeighted(overlay, 0.3, frame, 0.7, 0, frame)
            cv2.polylines(frame, [zone], True, C_RED, 2, cv2.LINE_AA)
            cv2.putText(frame, "RESTRICTED ZONE", (zone[0][0] + 10, zone[0][1] + 25),
                        FONT, 0.55, C_RED, 2, cv2.LINE_AA)

            try:
                results = model.track(
                    source=frame, classes=[PERSON_CLASS], conf=conf,
                    iou=0.70, device=device, persist=True, verbose=False
                )
            except Exception:
                try:
                    results = model.predict(
                        source=frame,
                        classes=[PERSON_CLASS],
                        conf=conf,
                        device=device,
                        verbose=False,
                    )
                except Exception:
                    writer.write(frame)
                    continue

            zone_count = 0

            boxes, tids, confs = _extract_person_detections(results)

            for i, bbox in enumerate(boxes):
                x1, y1, x2, y2 = map(int, bbox)
                tid = tids[i] if i < len(tids) else i
                conf_score = float(confs[i]) if i < len(confs) else 1.0
                cx = (x1 + x2) // 2
                cy = (y1 + y2) // 2
                foot_y = y2  # use foot position for zone check

                in_zone = point_in_polygon(cx, foot_y, zone)

                if in_zone:
                    zone_count += 1
                    total_intrusions += 1
                    seen_intruders.add(tid)
                    cv2.rectangle(frame, (x1, y1), (x2, y2), C_RED, 3)
                    draw_label(frame, f"#{tid} INTRUDER", x1, y1, C_RED)
                    radius = max(15, (x2 - x1) // 2)
                    cv2.circle(frame, (cx, cy), radius, C_RED, 2, cv2.LINE_AA)
                    if tid not in intrusion_events:
                        intrusion_events[tid] = {
                            "object_type": "person",
                            "first_seen_frame": frame_num,
                            "last_seen_frame": frame_num,
                            "observations": 0,
                            "confidence_sum": 0.0,
                            "confidence_max": 0.0,
                        }
                    event = intrusion_events[tid]
                    event["last_seen_frame"] = frame_num
                    event["observations"] = int(event["observations"]) + 1
                    event["confidence_sum"] = float(event["confidence_sum"]) + conf_score
                    event["confidence_max"] = max(float(event["confidence_max"]), conf_score)
                else:
                    cv2.rectangle(frame, (x1, y1), (x2, y2), C_GREEN, 2)
                    draw_label(frame, f"#{tid}", x1, y1, C_GREEN)

            peak_zone_occupancy = max(peak_zone_occupancy, zone_count)

            # HUD
            fps_live = frame_num / max(1e-6, time.time() - t0)

            draw_hud_panel(frame, "ZONE SECURITY", [
                (f"In Zone:       {zone_count}", C_RED if zone_count > 0 else C_GREEN),
                (f"Intrusions:    {total_intrusions}", C_RED if total_intrusions > 0 else C_GREEN),
                (f"Unique Intrs:  {len(seen_intruders)}", C_YELLOW),
                (f"Peak in Zone:  {peak_zone_occupancy}", C_CYAN),
                (f"FPS:           {fps_live:.1f}", C_GRAY),
            ])

            if zone_count > 0:
                draw_alert_bar(frame, f"  ZONE BREACH — {zone_count} UNAUTHORIZED PERSON(S) IN RESTRICTED ZONE  ")

            writer.write(frame)

            if show:
                disp = cv2.resize(frame, (min(fw, 1280), min(fh, 720)))
                cv2.imshow("Zone Intrusion Detection", disp)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break

    finally:
        cap.release()
        writer.release()
        if show:
            cv2.destroyAllWindows()

    if not os.path.isfile(out_p) or os.path.getsize(out_p) == 0:
        raise RuntimeError(f"Output missing or empty: {out_p}")

    processing_time_sec = round(time.time() - t0, 2)
    duration_sec = round(frame_num / sfps, 2) if sfps else None
    intrusion_summaries = []

    for tid, event in sorted(intrusion_events.items(), key=lambda item: int(item[0])):
        entry_time = round(int(event["first_seen_frame"]) / sfps, 2) if sfps else None
        exit_time = round(int(event["last_seen_frame"]) / sfps, 2) if sfps else None
        duration = (
            round(max(0, int(event["last_seen_frame"]) - int(event["first_seen_frame"])) / sfps, 2)
            if sfps else None
        )
        max_confidence = round(float(event["confidence_max"]), 4)
        if (duration or 0) >= 10 or max_confidence >= 0.85:
            severity = "high"
        elif (duration or 0) >= 5 or max_confidence >= 0.6:
            severity = "medium"
        else:
            severity = "low"

        intrusion_summaries.append(
            {
                "object_type": str(event["object_type"]),
                "authorized": False,
                "entry_time": entry_time,
                "exit_time": exit_time,
                "duration_sec": duration,
                "alert_type": "zone_intrusion",
                "severity": severity,
                "confidence_score": round(float(event["confidence_sum"]) / max(1, int(event["observations"])), 4),
                "status": "violation",
                "notes": "authorized is inferred as false because detections are inside a restricted zone; tracked object id is stored in metadata only.",
                "metadata": {
                    "tracked_object_id": str(tid),
                    "observations": int(event["observations"]),
                    "max_confidence": max_confidence,
                    "zone_type": "restricted",
                },
            }
        )

    return {
        "output_video": out_p,
        "metrics": {
            "total_intrusions": total_intrusions,
            "unique_intruders": len(seen_intruders),
            "peak_zone_occupancy": peak_zone_occupancy,
            "frames_analyzed": frame_num,
            "processing_time_sec": processing_time_sec,
            "video_duration_sec": duration_sec,
            "event_rows_generated": len(intrusion_summaries),
        },
        "analytics": {
            "video_summary": {
                "frame_count": frame_num,
                "fps": round(float(sfps), 2) if sfps else None,
                "duration_sec": duration_sec,
                "processing_time_sec": processing_time_sec,
                "simulated_timestamp": datetime.now(timezone.utc).isoformat(),
                "zone_type": "restricted",
            },
            "intrusion_summaries": intrusion_summaries,
        },
    }
