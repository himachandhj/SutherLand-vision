"""
Zone Intrusion Detection - Pre-built Use Case
---------------------------------------------
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
    load_model, draw_hud_panel, draw_alert_bar, draw_label, read_video_profile,
)


DETECTION_CLASSES = {
    0: "person",
    1: "bicycle",
    2: "car",
    3: "motorcycle",
    5: "bus",
    7: "truck",
}
# Backward-compatibility alias expected by app/main.py and older call sites.
# Person remains COCO class id 0.
PERSON_CLASS = 0
REQUIRED_REGION_CLASSES = {
    "person",
    "bicycle",
    "car",
    "motorcycle",
    "bus",
    "truck",
}


def _normalize_model_names(names: object) -> list[str]:
    if isinstance(names, dict):
        raw_names = list(names.values())
    elif isinstance(names, (list, tuple)):
        raw_names = list(names)
    else:
        raw_names = []
    return [str(name).strip().lower() for name in raw_names if str(name).strip()]


def _region_model_is_compatible(model_class_names: list[str]) -> bool:
    normalized = set(model_class_names)
    has_person = "person" in normalized
    has_vehicle = bool(normalized.intersection(REQUIRED_REGION_CLASSES - {"person"}))
    return has_person and has_vehicle


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


def zone_from_normalized_points(points: list[list[float]] | tuple[tuple[float, float], ...] | None, fw: int, fh: int) -> np.ndarray:
    if not points:
        return create_default_zone(fw, fh)

    normalized_points: list[list[int]] = []
    for point in points:
        if not isinstance(point, (list, tuple)) or len(point) != 2:
            continue
        try:
            x = max(0.0, min(1.0, float(point[0])))
            y = max(0.0, min(1.0, float(point[1])))
        except (TypeError, ValueError):
            continue
        normalized_points.append([
            int(round(x * fw)),
            int(round(y * fh)),
        ])

    if len(normalized_points) < 4:
        return create_default_zone(fw, fh)
    return np.asarray(normalized_points, dtype=np.int32)


def _extract_person_detections(results) -> tuple[list, list[int], list[float], list[int]]:
    if not results or results[0].boxes is None:
        return [], [], [], []

    det = results[0].boxes
    if det.xyxy is None or len(det.xyxy) == 0:
        return [], [], [], []

    boxes = det.xyxy.cpu().numpy()
    tids = (
        det.id.cpu().numpy().astype(int).tolist()
        if det.id is not None else list(range(len(boxes)))
    )
    confs = (
        det.conf.cpu().numpy().tolist()
        if det.conf is not None else [1.0] * len(boxes)
    )
    class_ids = (
        det.cls.cpu().numpy().astype(int).tolist()
        if det.cls is not None else [0] * len(boxes)
    )
    return boxes, tids, confs, class_ids


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
    requested_mode = str(kwargs.get("model_mode") or "active").strip().lower()
    selected_model_path = str(model_path or "yolov8n.pt")
    fallback_used = False
    fallback_reason: str | None = None
    rule_config = kwargs.get("rule_config") or {}

    try:
        confidence_threshold = float(rule_config.get("confidence_threshold", conf))
    except (TypeError, ValueError):
        confidence_threshold = conf
    confidence_threshold = max(0.1, min(1.0, confidence_threshold))

    try:
        alert_delay_sec = float(rule_config.get("alert_delay_sec", 0))
    except (TypeError, ValueError):
        alert_delay_sec = 0.0
    alert_delay_sec = max(0.0, min(10.0, alert_delay_sec))

    alerts_enabled = bool(rule_config.get("alerts_enabled", True))
    trigger_type = str(rule_config.get("trigger_type") or "enter").strip().lower()

    try:
        model = load_model(selected_model_path)
    except Exception:
        fallback_used = True
        fallback_reason = "region_model_unavailable"
        selected_model_path = "yolov8n.pt"
        model = load_model(selected_model_path)

    model_class_names = _normalize_model_names(getattr(model, "names", {}))
    requested_model_class_names = list(model_class_names)
    model_is_compatible = _region_model_is_compatible(model_class_names)
    if not model_is_compatible and selected_model_path != "yolov8n.pt":
        fallback_used = True
        fallback_reason = (
            "staged_region_model_missing_required_classes"
            if requested_mode == "staging"
            else "region_model_missing_required_classes"
        )
        selected_model_path = "yolov8n.pt"
        model = load_model(selected_model_path)
        model_class_names = _normalize_model_names(getattr(model, "names", {}))
        model_is_compatible = _region_model_is_compatible(model_class_names)

    inference_conf = (
        min(confidence_threshold, 0.20)
        if requested_mode == "staging" and model_is_compatible
        else confidence_threshold
    )

    cap = open_video(input_p)
    source_profile = read_video_profile(input_p, cap=cap)
    fw = int(source_profile.get("width") or cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    fh = int(source_profile.get("height") or cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    writer_fps = float(source_profile.get("normalized_fps") or source_profile.get("fps") or 25.0)
    total_frames = int(source_profile.get("frame_count") or cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    source_duration_sec = source_profile.get("duration_sec")
    writer = create_writer(out_p, writer_fps, fw, fh)

    # Define restricted zone
    zone = zone_from_normalized_points(kwargs.get("zone_points_normalized"), fw, fh)
    effective_conf = confidence_threshold
    required_frames = max(0, int(round(alert_delay_sec * writer_fps)))

    seen_intruders = set()
    total_intrusions = 0
    peak_zone_occupancy = 0
    frame_num = 0
    t0 = time.time()
    intrusion_events: dict[int, dict[str, float | int | str]] = {}
    detections_before_filter = 0
    detections_after_filter = 0
    person_in_zone_frames: dict[int, int] = {}

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
                    source=frame, classes=list(DETECTION_CLASSES.keys()), conf=inference_conf,
                    iou=0.70, device=device, persist=True, verbose=False
                )
            except Exception:
                try:
                    results = model.predict(
                        source=frame,
                        classes=list(DETECTION_CLASSES.keys()),
                        conf=inference_conf,
                        device=device,
                        verbose=False,
                    )
                except Exception:
                    writer.write(frame)
                    continue

            zone_count = 0
            active_tids = set()

            boxes, tids, confs, class_ids = _extract_person_detections(results)
            detections_before_filter += len(boxes)

            for i, bbox in enumerate(boxes):
                x1, y1, x2, y2 = map(int, bbox)
                tid = tids[i] if i < len(tids) else i
                conf_score = float(confs[i]) if i < len(confs) else 1.0
                class_id = int(class_ids[i]) if i < len(class_ids) else 0
                object_type = DETECTION_CLASSES.get(class_id, "object")
                if conf_score < confidence_threshold:
                    continue
                cx = (x1 + x2) // 2
                cy = (y1 + y2) // 2
                foot_y = y2  # use foot position for zone check
                active_tids.add(tid)

                in_zone = point_in_polygon(cx, foot_y, zone)

                if in_zone:
                    person_in_zone_frames[tid] = person_in_zone_frames.get(tid, 0) + 1
                    delay_satisfied = required_frames == 0 or person_in_zone_frames[tid] >= required_frames
                    if alerts_enabled and delay_satisfied:
                        zone_count += 1
                        detections_after_filter += 1
                        if tid not in seen_intruders:
                            total_intrusions += 1
                            seen_intruders.add(tid)
                        cv2.rectangle(frame, (x1, y1), (x2, y2), C_RED, 3)
                        draw_label(frame, f"#{tid} {object_type} INTRUDER", x1, y1, C_RED)
                        radius = max(15, (x2 - x1) // 2)
                        cv2.circle(frame, (cx, cy), radius, C_RED, 2, cv2.LINE_AA)
                        if tid not in intrusion_events:
                            intrusion_events[tid] = {
                                "object_type": object_type,
                                "first_seen_frame": frame_num,
                                "last_seen_frame": frame_num,
                                "observations": 0,
                                "confidence_sum": 0.0,
                                "confidence_max": 0.0,
                            }
                        event = intrusion_events[tid]
                        event["object_type"] = object_type
                        event["last_seen_frame"] = frame_num
                        event["observations"] = int(event["observations"]) + 1
                        event["confidence_sum"] = float(event["confidence_sum"]) + conf_score
                        event["confidence_max"] = max(float(event["confidence_max"]), conf_score)
                    else:
                        cv2.rectangle(frame, (x1, y1), (x2, y2), C_YELLOW, 2)
                        status_label = "IN ZONE" if not alerts_enabled else "VERIFYING"
                        draw_label(frame, f"#{tid} {object_type} {status_label}", x1, y1, C_YELLOW)
                else:
                    person_in_zone_frames.pop(tid, None)
                    cv2.rectangle(frame, (x1, y1), (x2, y2), C_GREEN, 2)
                    draw_label(frame, f"#{tid} {object_type}", x1, y1, C_GREEN)

            for tracked_tid in list(person_in_zone_frames.keys()):
                if tracked_tid not in active_tids:
                    person_in_zone_frames.pop(tracked_tid, None)

            peak_zone_occupancy = max(peak_zone_occupancy, zone_count)

            # HUD
            fps_live = frame_num / max(1e-6, time.time() - t0)

            draw_hud_panel(frame, "ZONE SECURITY", [
                (f"In Zone:       {zone_count}", C_RED if zone_count > 0 else C_GREEN),
                (f"Intrusions:    {total_intrusions}", C_RED if total_intrusions > 0 else C_GREEN),
                (f"Unique Intrs:  {len(seen_intruders)}", C_YELLOW),
                (f"Peak in Zone:  {peak_zone_occupancy}", C_CYAN),
                (f"Delay:         {alert_delay_sec:.1f}s", C_BLUE),
                (f"Trigger:       {trigger_type}", C_GRAY),
                (f"FPS:           {fps_live:.1f}", C_GRAY),
            ])

            if zone_count > 0:
                draw_alert_bar(frame, f"  ZONE BREACH — {zone_count} UNAUTHORIZED OBJECT(S) IN RESTRICTED ZONE  ")

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
    output_duration_sec = round(frame_num / writer_fps, 4) if writer_fps else None
    intrusion_summaries = []

    for tid, event in sorted(intrusion_events.items(), key=lambda item: int(item[0])):
        entry_time = round(int(event["first_seen_frame"]) / writer_fps, 2) if writer_fps else None
        exit_time = round(int(event["last_seen_frame"]) / writer_fps, 2) if writer_fps else None
        duration = (
            round(max(0, int(event["last_seen_frame"]) - int(event["first_seen_frame"])) / writer_fps, 2)
            if writer_fps else None
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
            "video_duration_sec": output_duration_sec,
            "input_fps": round(float(writer_fps), 4) if writer_fps else None,
            "output_fps": round(float(writer_fps), 4) if writer_fps else None,
            "input_duration_sec": round(float(source_duration_sec), 4) if source_duration_sec else output_duration_sec,
            "output_duration_sec": output_duration_sec,
            "input_frame_count": total_frames or frame_num,
            "frame_width": fw,
            "frame_height": fh,
            "fps_source": str(source_profile.get("fps_source") or "fallback_default"),
            "raw_input_fps": round(float(source_profile.get("raw_fps")), 4) if source_profile.get("raw_fps") else None,
            "normalized_input_fps": round(float(writer_fps), 4) if writer_fps else None,
            "decoded_input_frame_count": int(source_profile.get("decoded_frame_count") or 0) or None,
            "reported_input_frame_count": int(source_profile.get("opencv_frame_count") or 0) or None,
            "input_frame_count_source": str(source_profile.get("frame_count_source") or "unknown"),
            "raw_duration_mismatch": bool(source_profile.get("raw_duration_mismatch")),
            "event_rows_generated": len(intrusion_summaries),
            "model_mode_used": requested_mode or "active",
            "model_path_used": selected_model_path,
            "model_class_names": model_class_names,
            "requested_model_class_names": requested_model_class_names,
            "detections_before_filter": detections_before_filter,
            "detections_after_filter": detections_after_filter,
            "fallback_used": fallback_used,
            "fallback_reason": fallback_reason,
        },
        "analytics": {
            "video_summary": {
                "frame_count": frame_num,
                "fps": round(float(writer_fps), 2) if writer_fps else None,
                "duration_sec": round(float(source_duration_sec), 2) if source_duration_sec else output_duration_sec,
                "processing_time_sec": processing_time_sec,
                "simulated_timestamp": datetime.now(timezone.utc).isoformat(),
                "zone_type": "restricted",
            },
            "intrusion_summaries": intrusion_summaries,
        },
    }
