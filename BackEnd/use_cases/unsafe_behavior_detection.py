"""
Unsafe Behavior Detection — Pre-built Use Case
==============================================
Detect smoking with a fine-tuned YOLO model and infer phone usage from
COCO person + cell phone detections using a simple association rule.
"""

from __future__ import annotations

import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import cv2

from use_cases.base import (
    C_GRAY,
    C_ORANGE,
    C_RED,
    C_WHITE,
    auto_device,
    build_output_path,
    create_writer,
    draw_hud_panel,
    draw_label,
    load_model,
    open_video,
    validate_output_video,
)


BASE_DIR = Path(__file__).resolve().parents[1]
DEFAULT_SMOKING_MODEL_PATH = Path("models/unsafe_behavior/smoking_best.pt")
DEFAULT_COCO_MODEL_PATH = Path("models/common/yolov8n.pt")
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

PERSON_CONF_THRESHOLD = 0.45
PHONE_CONF_THRESHOLD = 0.35
SMOKING_CONF_THRESHOLD = 0.35


def _resolve_smoking_model_path(model_path: str | None) -> str:
    candidate = Path(model_path or DEFAULT_SMOKING_MODEL_PATH)
    resolved = candidate if candidate.is_absolute() else BASE_DIR / candidate
    if not resolved.is_file():
        raise RuntimeError("Smoking model not found at models/unsafe_behavior/smoking_best.pt")
    return str(resolved)


def _load_coco_model() -> tuple[Any, str]:
    local_coco = BASE_DIR / DEFAULT_COCO_MODEL_PATH
    coco_candidate = str(local_coco) if local_coco.is_file() else "yolov8n.pt"
    try:
        return load_model(coco_candidate), coco_candidate
    except Exception as error:
        raise RuntimeError("COCO model not found or could not be loaded") from error


def _normalize_names(names: object) -> dict[int, str]:
    if isinstance(names, dict):
        return {int(class_id): str(name) for class_id, name in names.items()}
    if isinstance(names, (list, tuple)):
        return {index: str(name) for index, name in enumerate(names)}
    return {}


def _normalize_label(label: str) -> str:
    return label.strip().lower().replace("_", " ").replace("-", " ")


def _severity_for_confidence(confidence: float) -> str:
    if confidence >= 0.75:
        return "high"
    if confidence >= 0.50:
        return "medium"
    return "low"


def _severity_color(severity: str) -> tuple[int, int, int]:
    if severity == "high":
        return C_RED
    if severity == "medium":
        return C_ORANGE
    return C_WHITE


def _resolve_class_id(names: dict[int, str], aliases: tuple[str, ...], fallback_id: int) -> int:
    normalized_aliases = {_normalize_label(alias) for alias in aliases}
    for class_id, name in names.items():
        if _normalize_label(name) in normalized_aliases:
            return int(class_id)
    return fallback_id


def _extract_boxes(results) -> tuple[list[list[int]], list[int], list[float], dict[int, str]]:
    if not results or results[0].boxes is None:
        return [], [], [], _normalize_names(getattr(results[0], "names", {}) if results else {})

    det = results[0].boxes
    if det.xyxy is None or len(det.xyxy) == 0:
        return [], [], [], _normalize_names(getattr(results[0], "names", {}) or {})

    boxes = det.xyxy.cpu().numpy().astype(int).tolist()
    class_ids = det.cls.cpu().numpy().astype(int).tolist() if det.cls is not None else []
    confidences = det.conf.cpu().numpy().tolist() if det.conf is not None else [1.0] * len(boxes)
    names = _normalize_names(getattr(results[0], "names", {}) or {})
    return boxes, class_ids, confidences, names


def _is_phone_usage(person_box: list[int], phone_box: list[int]) -> bool:
    px1, py1, px2, py2 = person_box
    fx1, fy1, fx2, fy2 = phone_box

    phone_center_x = (fx1 + fx2) / 2.0
    phone_center_y = (fy1 + fy2) / 2.0
    person_height = max(1.0, py2 - py1)

    center_inside_person = px1 <= phone_center_x <= px2 and py1 <= phone_center_y <= py2
    phone_in_upper_body = phone_center_y <= py1 + 0.70 * person_height

    return center_inside_person and phone_in_upper_body


def _run_frame_inference(
    *,
    frame,
    smoking_model,
    coco_model,
    smoking_conf: float,
    coco_conf: float,
    device: str | None,
    frame_number: int,
    fps: float,
) -> tuple[Any, dict[str, Any]]:
    smoking_results = smoking_model.predict(
        source=frame,
        conf=max(smoking_conf, SMOKING_CONF_THRESHOLD),
        device=device,
        imgsz=640,
        verbose=False,
    )
    smoking_boxes, smoking_class_ids, smoking_confidences, smoking_names = _extract_boxes(smoking_results)

    smoking_events: list[dict[str, Any]] = []
    preview_detections: list[dict[str, Any]] = []
    total_confidence = 0.0
    max_confidence = 0.0
    annotated = frame.copy()

    for index, bbox in enumerate(smoking_boxes):
        x1, y1, x2, y2 = bbox
        confidence = float(smoking_confidences[index]) if index < len(smoking_confidences) else 1.0
        class_id = smoking_class_ids[index] if index < len(smoking_class_ids) else -1
        class_name = smoking_names.get(class_id, f"class_{class_id}")
        severity = _severity_for_confidence(confidence)
        color = _severity_color(severity)

        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        draw_label(annotated, f"Smoking {confidence:.0%}", x1, y1, color)

        smoking_events.append(
            {
                "frame_number": frame_number,
                "timestamp_sec": round(frame_number / fps, 3),
                "event_type": "smoking",
                "confidence": round(confidence, 4),
                "bbox": [x1, y1, x2, y2],
                "source": "smoking_model",
                "associated_person_box": None,
                "status": "unsafe",
                "severity": severity,
                "class_name": class_name,
            }
        )
        preview_detections.append(
            {
                "class": "smoking",
                "confidence": round(confidence, 4),
                "severity": severity,
            }
        )
        total_confidence += confidence
        max_confidence = max(max_confidence, confidence)

    coco_results = coco_model.predict(
        source=frame,
        conf=min(max(coco_conf, PHONE_CONF_THRESHOLD), 0.99),
        device=device,
        imgsz=640,
        verbose=False,
    )
    coco_boxes, coco_class_ids, coco_confidences, coco_names = _extract_boxes(coco_results)

    person_class_id = _resolve_class_id(coco_names, ("person",), 0)
    phone_class_id = _resolve_class_id(coco_names, ("cell phone", "cellphone", "mobile phone", "phone"), 67)

    persons: list[dict[str, Any]] = []
    phones: list[dict[str, Any]] = []
    for index, bbox in enumerate(coco_boxes):
        class_id = coco_class_ids[index] if index < len(coco_class_ids) else -1
        confidence = float(coco_confidences[index]) if index < len(coco_confidences) else 1.0
        entry = {"bbox": bbox, "confidence": confidence, "class_id": class_id}
        if class_id == person_class_id and confidence >= PERSON_CONF_THRESHOLD:
            persons.append(entry)
        elif class_id == phone_class_id and confidence >= PHONE_CONF_THRESHOLD:
            phones.append(entry)

    phone_usage_events: list[dict[str, Any]] = []
    for phone in phones:
        phone_box = phone["bbox"]
        matched_person = None
        for person in persons:
            if _is_phone_usage(person["bbox"], phone_box):
                if matched_person is None or person["confidence"] > matched_person["confidence"]:
                    matched_person = person
        if matched_person is None:
            continue

        confidence = max(float(phone["confidence"]), float(matched_person["confidence"]))
        severity = _severity_for_confidence(confidence)
        color = _severity_color(severity)
        px1, py1, px2, py2 = matched_person["bbox"]
        fx1, fy1, fx2, fy2 = phone_box

        cv2.rectangle(annotated, (px1, py1), (px2, py2), color, 2)
        cv2.rectangle(annotated, (fx1, fy1), (fx2, fy2), C_ORANGE, 2)
        draw_label(annotated, "Phone Usage", fx1, fy1, C_ORANGE)

        phone_usage_events.append(
            {
                "frame_number": frame_number,
                "timestamp_sec": round(frame_number / fps, 3),
                "event_type": "phone_usage",
                "confidence": round(confidence, 4),
                "bbox": [fx1, fy1, fx2, fy2],
                "source": "coco_phone_rule",
                "associated_person_box": [px1, py1, px2, py2],
                "status": "unsafe",
                "severity": severity,
            }
        )
        preview_detections.append(
            {
                "class": "phone_usage",
                "confidence": round(confidence, 4),
                "severity": severity,
            }
        )
        total_confidence += confidence
        max_confidence = max(max_confidence, confidence)

    events = smoking_events + phone_usage_events
    return annotated, {
        "events": events,
        "preview_detections": preview_detections,
        "smoking_count": len(smoking_events),
        "phone_usage_count": len(phone_usage_events),
        "total_confidence": total_confidence,
        "max_confidence": max_confidence,
    }


def process_image(
    *,
    frame,
    model_path: str | None = None,
    device: str | None = None,
    conf: float = 0.35,
) -> dict[str, Any]:
    device = device or auto_device()
    smoking_model = load_model(_resolve_smoking_model_path(model_path))
    coco_model, _ = _load_coco_model()

    annotated, frame_summary = _run_frame_inference(
        frame=frame,
        smoking_model=smoking_model,
        coco_model=coco_model,
        smoking_conf=max(conf, SMOKING_CONF_THRESHOLD),
        coco_conf=conf,
        device=device,
        frame_number=1,
        fps=1.0,
    )
    total_events = int(frame_summary["smoking_count"]) + int(frame_summary["phone_usage_count"])
    total_confidence = float(frame_summary["total_confidence"])
    avg_confidence = round(total_confidence / total_events, 4) if total_events else 0.0

    return {
        "annotated_image": annotated,
        "detections": frame_summary["preview_detections"],
        "metrics": {
            "total_unsafe_events": total_events,
            "smoking_events": int(frame_summary["smoking_count"]),
            "phone_usage_events": int(frame_summary["phone_usage_count"]),
            "frames_analyzed": 1,
            "frames_with_unsafe_behavior": 1 if total_events > 0 else 0,
            "unsafe_rate_pct": 100.0 if total_events > 0 else 0.0,
            "max_confidence": round(float(frame_summary["max_confidence"]), 4),
            "avg_confidence": avg_confidence,
            "processing_time_sec": 0.0,
            "video_duration_sec": 0.0,
        },
        "analytics": {
            "video_summary": {
                "frame_count": 1,
                "fps": 1.0,
                "duration_sec": 0.0,
                "processing_time_sec": 0.0,
                "simulated_timestamp": datetime.now(timezone.utc).isoformat(),
            },
            "unsafe_events": frame_summary["events"],
            "summary_counts": {
                "smoking": int(frame_summary["smoking_count"]),
                "phone_usage": int(frame_summary["phone_usage_count"]),
            },
        },
    }


def process_video(
    *,
    input_path: str,
    output_path: str | None = None,
    model_path: str | None = None,
    device: str | None = None,
    show: bool = False,
    conf: float = 0.35,
    **kwargs: Any,
) -> dict[str, Any]:
    del kwargs

    device = device or auto_device()
    input_p = os.path.abspath(input_path)
    input_suffix = Path(input_p).suffix.lower()

    if input_suffix in IMAGE_EXTENSIONS:
        frame = cv2.imread(input_p)
        if frame is None:
            raise RuntimeError(f"Unable to read unsafe behavior input image: {input_path}")
        image_result = process_image(
            frame=frame,
            model_path=model_path,
            device=device,
            conf=conf,
        )
        annotated_image = image_result.get("annotated_image")
        if annotated_image is None:
            raise RuntimeError("Unsafe behavior detection did not produce an annotated image.")
        if output_path:
            out_p = os.path.abspath(output_path)
        else:
            source_path = Path(input_p)
            out_p = str(source_path.with_name(f"{source_path.stem}_unsafe_behavior{source_path.suffix or '.jpg'}"))
        Path(out_p).parent.mkdir(parents=True, exist_ok=True)
        if not cv2.imwrite(out_p, annotated_image):
            raise RuntimeError(f"Unable to write unsafe behavior output image: {out_p}")
        return {
            "output_video": out_p,
            "metrics": image_result.get("metrics", {}),
            "analytics": image_result.get("analytics", {}),
        }

    out_p = build_output_path(input_p, output_path, "_unsafe_behavior")
    smoking_model = load_model(_resolve_smoking_model_path(model_path))
    coco_model, _ = _load_coco_model()

    cap = open_video(input_p)
    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    source_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    writer = create_writer(out_p, source_fps, frame_width, frame_height)

    frame_num = 0
    smoking_events = 0
    phone_usage_events = 0
    frames_with_unsafe_behavior = 0
    total_confidence = 0.0
    max_confidence = 0.0
    unsafe_events: list[dict[str, Any]] = []
    t0 = time.time()

    try:
        while cap.isOpened():
            ok, frame = cap.read()
            if not ok:
                break
            frame_num += 1

            frame, frame_summary = _run_frame_inference(
                frame=frame,
                smoking_model=smoking_model,
                coco_model=coco_model,
                smoking_conf=max(conf, SMOKING_CONF_THRESHOLD),
                coco_conf=conf,
                device=device,
                frame_number=frame_num,
                fps=source_fps,
            )

            smoking_events += int(frame_summary["smoking_count"])
            phone_usage_events += int(frame_summary["phone_usage_count"])
            total_events = smoking_events + phone_usage_events
            current_frame_events = int(frame_summary["smoking_count"]) + int(frame_summary["phone_usage_count"])
            if current_frame_events > 0:
                frames_with_unsafe_behavior += 1

            total_confidence += float(frame_summary["total_confidence"])
            max_confidence = max(max_confidence, float(frame_summary["max_confidence"]))
            unsafe_events.extend(frame_summary["events"])

            elapsed = max(1e-6, time.time() - t0)
            fps_live = frame_num / elapsed
            avg_confidence_live = total_confidence / total_events if total_events else 0.0
            unsafe_rate_pct = (frames_with_unsafe_behavior / frame_num * 100.0) if frame_num else 0.0

            draw_hud_panel(
                frame,
                "UNSAFE BEHAVIOR",
                [
                    (f"Smoking:      {smoking_events}", C_RED),
                    (f"Phone Usage:  {phone_usage_events}", C_ORANGE),
                    (f"Total Unsafe:  {total_events}", C_WHITE),
                    (f"Unsafe Rate:   {unsafe_rate_pct:.1f}%", C_WHITE),
                    (f"Avg Conf:      {avg_confidence_live:.2f}", C_WHITE),
                    (f"Frames:        {frame_num}", C_GRAY),
                    (f"FPS:           {fps_live:.1f}", C_GRAY),
                ],
            )

            writer.write(frame)

            if show:
                display = cv2.resize(frame, (min(frame_width, 1280), min(frame_height, 720)))
                cv2.imshow("Unsafe Behavior Detection", display)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break
    finally:
        cap.release()
        writer.release()
        if show:
            cv2.destroyAllWindows()

    validate_output_video(out_p)

    processing_time_sec = round(time.time() - t0, 3)
    video_duration_sec = round(
        (total_frames / source_fps) if total_frames > 0 and source_fps > 0 else (frame_num / source_fps if source_fps > 0 else 0.0),
        3,
    )
    total_unsafe_events = smoking_events + phone_usage_events
    avg_confidence = round(total_confidence / total_unsafe_events, 4) if total_unsafe_events else 0.0
    unsafe_rate_pct = round((frames_with_unsafe_behavior / frame_num * 100.0), 2) if frame_num else 0.0

    return {
        "output_video": out_p,
        "metrics": {
            "total_unsafe_events": total_unsafe_events,
            "smoking_events": smoking_events,
            "phone_usage_events": phone_usage_events,
            "frames_analyzed": frame_num,
            "frames_with_unsafe_behavior": frames_with_unsafe_behavior,
            "unsafe_rate_pct": unsafe_rate_pct,
            "max_confidence": round(max_confidence, 4),
            "avg_confidence": avg_confidence,
            "processing_time_sec": processing_time_sec,
            "video_duration_sec": video_duration_sec,
        },
        "analytics": {
            "video_summary": {
                "frame_count": frame_num,
                "fps": round(float(source_fps), 3),
                "duration_sec": video_duration_sec,
                "processing_time_sec": processing_time_sec,
                "simulated_timestamp": datetime.now(timezone.utc).isoformat(),
            },
            "unsafe_events": unsafe_events,
            "summary_counts": {
                "smoking": smoking_events,
                "phone_usage": phone_usage_events,
            },
        },
    }
