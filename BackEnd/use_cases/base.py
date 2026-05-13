"""
Shared utilities for all use case video processors.
"""

import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import warnings

warnings.filterwarnings("ignore")

import cv2
import numpy as np
from ultralytics import YOLO

DEFAULT_VIDEO_FPS = 25.0
MIN_REASONABLE_VIDEO_FPS = 1.0
MAX_REASONABLE_VIDEO_FPS = 120.0
MAX_NORMALIZED_VIDEO_FPS = 60.0
DURATION_MISMATCH_TOLERANCE_RATIO = 0.15


def auto_device() -> str:
    """Auto-detect the best available compute device."""
    try:
        import torch
        if torch.cuda.is_available():
            return "0"
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
    except Exception:
        pass
    return "cpu"


def open_video(path: str) -> cv2.VideoCapture:
    """Open a video file and return the capture object."""
    if not os.path.isfile(path):
        raise RuntimeError(f"Input not found: {path}")
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open: {path}")
    return cap


def _coerce_positive_float(value) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number) or number <= 0:
        return None
    return number


def _coerce_positive_int(value) -> int | None:
    number = _coerce_positive_float(value)
    if number is None:
        return None
    return int(number)


def _parse_ffprobe_rate(value: str | None) -> float | None:
    if not value or value == "N/A":
        return None
    if "/" in value:
        numerator_raw, denominator_raw = value.split("/", 1)
        try:
            numerator = float(numerator_raw)
            denominator = float(denominator_raw)
        except (TypeError, ValueError):
            return None
        if not math.isfinite(numerator) or not math.isfinite(denominator) or denominator <= 0 or numerator <= 0:
            return None
        rate = numerator / denominator
        return rate if math.isfinite(rate) and rate > 0 else None
    return _coerce_positive_float(value)


def _relative_delta(left: float | None, right: float | None) -> float | None:
    if left is None or right is None:
        return None
    baseline = max(abs(left), abs(right), 1e-6)
    return abs(left - right) / baseline


def _clamp_fps(value: float | None, *, minimum: float = MIN_REASONABLE_VIDEO_FPS, maximum: float = MAX_NORMALIZED_VIDEO_FPS) -> float | None:
    number = _coerce_positive_float(value)
    if number is None:
        return None
    return max(minimum, min(maximum, number))


def probe_video_stream_metadata(path: str, *, count_frames: bool = False) -> dict[str, float | int | None]:
    """Read stream metadata via ffprobe when available."""
    ffprobe_path = shutil.which("ffprobe")
    if ffprobe_path is None:
        return {
            "avg_fps": None,
            "stream_fps": None,
            "frame_count": None,
            "read_frame_count": None,
            "duration_sec": None,
            "width": None,
            "height": None,
        }

    try:
        command = [
            ffprobe_path,
            "-v",
            "error",
        ]
        if count_frames:
            command.append("-count_frames")
        command.extend(
            [
                "-show_entries",
                "stream=avg_frame_rate,r_frame_rate,nb_frames,nb_read_frames,width,height,duration:format=duration",
                "-of",
                "json",
                path,
            ]
        )
        result = subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
        )
        payload = json.loads(result.stdout or "{}")
    except Exception:
        return {
            "avg_fps": None,
            "stream_fps": None,
            "frame_count": None,
            "read_frame_count": None,
            "duration_sec": None,
            "width": None,
            "height": None,
        }

    stream = ((payload.get("streams") or [None])[0]) or {}
    format_info = payload.get("format") or {}
    return {
        "avg_fps": _parse_ffprobe_rate(stream.get("avg_frame_rate")),
        "stream_fps": _parse_ffprobe_rate(stream.get("r_frame_rate")),
        "frame_count": _coerce_positive_int(stream.get("nb_frames")),
        "read_frame_count": _coerce_positive_int(stream.get("nb_read_frames")),
        "duration_sec": _coerce_positive_float(stream.get("duration")) or _coerce_positive_float(format_info.get("duration")),
        "width": _coerce_positive_int(stream.get("width")),
        "height": _coerce_positive_int(stream.get("height")),
    }


def read_video_profile(
    path: str,
    *,
    cap: cv2.VideoCapture | None = None,
    default_fps: float = DEFAULT_VIDEO_FPS,
    max_reasonable_fps: float = MAX_REASONABLE_VIDEO_FPS,
) -> dict[str, float | int | str | None]:
    """
    Normalize source video metadata.

    OpenCV can report bogus values such as 1000 FPS for some browser- or mobile-
    generated files. When that happens, prefer ffprobe metadata or a frame-count /
    duration estimate before falling back to a safe default FPS.
    """
    owns_capture = cap is None
    capture = cap or open_video(path)
    try:
        raw_fps = _coerce_positive_float(capture.get(cv2.CAP_PROP_FPS))
        opencv_frame_count = _coerce_positive_int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        width = _coerce_positive_int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = _coerce_positive_int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    finally:
        if owns_capture:
            capture.release()

    opencv_duration_sec = None
    if raw_fps is not None and opencv_frame_count is not None and raw_fps > 0:
        opencv_duration_sec = opencv_frame_count / raw_fps
        if not math.isfinite(opencv_duration_sec) or opencv_duration_sec <= 0:
            opencv_duration_sec = None

    probed = probe_video_stream_metadata(path)
    avg_fps = _coerce_positive_float(probed.get("avg_fps"))
    stream_fps = _coerce_positive_float(probed.get("stream_fps"))
    probed_frame_count = _coerce_positive_int(probed.get("frame_count"))
    decoded_frame_count = _coerce_positive_int(probed.get("read_frame_count"))
    duration_sec = _coerce_positive_float(probed.get("duration_sec")) or opencv_duration_sec

    if width is None:
        width = _coerce_positive_int(probed.get("width"))
    if height is None:
        height = _coerce_positive_int(probed.get("height"))

    raw_fps_invalid = raw_fps is None or raw_fps < MIN_REASONABLE_VIDEO_FPS or raw_fps > max_reasonable_fps
    metadata_frame_count = decoded_frame_count or probed_frame_count or opencv_frame_count
    raw_duration_mismatch = False
    if (
        raw_fps is not None
        and duration_sec is not None
        and duration_sec > 0
        and metadata_frame_count is not None
        and metadata_frame_count > 0
    ):
        estimated_duration = metadata_frame_count / raw_fps
        mismatch_ratio = _relative_delta(estimated_duration, duration_sec)
        raw_duration_mismatch = bool(
            mismatch_ratio is not None and mismatch_ratio > DURATION_MISMATCH_TOLERANCE_RATIO
        )

    suspicious_stream_timing = bool(
        (stream_fps is not None and stream_fps > max_reasonable_fps)
        or (avg_fps is None and stream_fps is not None and stream_fps > max_reasonable_fps)
    )
    needs_decoded_frame_count = bool(
        duration_sec is not None
        and (
            raw_fps_invalid
            or raw_duration_mismatch
            or suspicious_stream_timing
            or decoded_frame_count is None
        )
    )
    if needs_decoded_frame_count:
        counted = probe_video_stream_metadata(path, count_frames=True)
        decoded_frame_count = _coerce_positive_int(counted.get("read_frame_count")) or decoded_frame_count
        probed_frame_count = _coerce_positive_int(counted.get("frame_count")) or probed_frame_count
        if duration_sec is None:
            duration_sec = _coerce_positive_float(counted.get("duration_sec")) or duration_sec
        if width is None:
            width = _coerce_positive_int(counted.get("width"))
        if height is None:
            height = _coerce_positive_int(counted.get("height"))

    normalized_frame_count = decoded_frame_count or probed_frame_count
    frame_count_source = (
        "ffprobe_count_frames"
        if decoded_frame_count is not None
        else "ffprobe_nb_frames"
        if probed_frame_count is not None
        else "opencv_frame_count"
        if opencv_frame_count is not None
        else "unknown"
    )
    if normalized_frame_count is None and not raw_fps_invalid and not raw_duration_mismatch:
        normalized_frame_count = opencv_frame_count

    derived_fps = None
    if normalized_frame_count is not None and duration_sec is not None and duration_sec > 0:
        derived_fps = normalized_frame_count / duration_sec
        if not math.isfinite(derived_fps) or derived_fps <= 0:
            derived_fps = None

    normalized_derived_fps = _clamp_fps(derived_fps)
    fps: float | None = None
    fps_source = "fallback_default"

    if raw_fps is not None and not raw_fps_invalid and not raw_duration_mismatch:
        fps = _clamp_fps(raw_fps)
        fps_source = "opencv"
    elif normalized_derived_fps is not None:
        fps = normalized_derived_fps
        fps_source = f"{frame_count_source}/duration"
    elif avg_fps is not None and MIN_REASONABLE_VIDEO_FPS <= avg_fps <= max_reasonable_fps:
        fps = _clamp_fps(avg_fps)
        fps_source = "ffprobe_avg_frame_rate"
    elif stream_fps is not None and MIN_REASONABLE_VIDEO_FPS <= stream_fps <= max_reasonable_fps:
        fps = _clamp_fps(stream_fps)
        fps_source = "ffprobe_stream_frame_rate"
    elif raw_fps is not None:
        fps = _clamp_fps(raw_fps)
        fps_source = "clamped_raw_fps"

    if fps is None:
        fps = _clamp_fps(default_fps) or DEFAULT_VIDEO_FPS

    if duration_sec is None and normalized_frame_count is not None and fps > 0:
        duration_sec = normalized_frame_count / fps

    return {
        "fps": fps,
        "normalized_fps": fps,
        "fps_source": fps_source,
        "raw_fps": raw_fps,
        "avg_fps": avg_fps,
        "stream_fps": stream_fps,
        "frame_count": normalized_frame_count or opencv_frame_count,
        "frame_count_source": frame_count_source,
        "opencv_frame_count": opencv_frame_count,
        "probed_frame_count": probed_frame_count,
        "decoded_frame_count": decoded_frame_count,
        "duration_sec": duration_sec,
        "opencv_duration_sec": opencv_duration_sec,
        "raw_duration_mismatch": raw_duration_mismatch,
        "width": width,
        "height": height,
    }


def create_writer(path: str, fps: float, w: int, h: int) -> cv2.VideoWriter:
    """Create an MP4 video writer, preferring browser-friendly H.264 when available."""
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    width = int(w)
    height = int(h)
    safe_fps = _clamp_fps(fps) or DEFAULT_VIDEO_FPS
    if width <= 0 or height <= 0:
        raise RuntimeError(f"Invalid video dimensions for output writer: width={width}, height={height}")

    last_error: str | None = None
    for codec in ("avc1", "H264", "X264", "mp4v"):
        fourcc = cv2.VideoWriter_fourcc(*codec)
        writer = cv2.VideoWriter(path, fourcc, safe_fps, (width, height))
        if writer.isOpened():
            return writer
        writer.release()
        last_error = codec

    raise RuntimeError(f"Unable to open MP4 writer for {path} using codecs avc1/H264/X264/mp4v (last tried: {last_error})")


def validate_output_video(path: str) -> int:
    """Validate that a finalized output video exists and is non-empty."""
    output_path = os.path.abspath(path)
    if not os.path.isfile(output_path):
        raise RuntimeError(f"Output missing: {output_path}")
    size = os.path.getsize(output_path)
    print("Output:", output_path)
    print("Size:", size)
    if size <= 0:
        raise RuntimeError(f"Output is empty: {output_path}")
    return size


def probe_video_codec(path: str) -> str | None:
    """Return the codec name for the first video stream, if ffprobe is available."""
    ffprobe_path = shutil.which("ffprobe")
    if ffprobe_path is None:
        return None
    try:
        result = subprocess.run(
            [
                ffprobe_path,
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=codec_name",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                path,
            ],
            check=True,
            capture_output=True,
            text=True,
        )
    except Exception:
        return None
    codec = result.stdout.strip()
    return codec or None


def ensure_browser_playable_mp4(path: str) -> str:
    """
    Transcode MP4 files to H.264 if the current codec is not browser-friendly.
    Keeps the final filename stable and only replaces the file after success.
    """
    output_path = os.path.abspath(path)
    codec = probe_video_codec(output_path)
    if codec in {None, "h264"}:
        return output_path

    ffmpeg_path = shutil.which("ffmpeg")
    if ffmpeg_path is None:
        return output_path

    temp_path = output_path + ".transcoded.mp4"
    try:
        subprocess.run(
            [
                ffmpeg_path,
                "-y",
                "-i",
                output_path,
                "-an",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                temp_path,
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        validate_output_video(temp_path)
        os.replace(temp_path, output_path)
        print("Transcoded codec:", codec, "-> h264")
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)

    return output_path


def _candidate_preview_frame_indices(frame_count: int | None) -> list[int]:
    if not frame_count or frame_count <= 0:
        return [0]

    candidates: list[int] = []
    for raw_index in (frame_count // 2, frame_count // 3, frame_count // 4, 0, frame_count - 1):
        index = max(0, min(frame_count - 1, int(raw_index)))
        if index not in candidates:
            candidates.append(index)
    return candidates


def _candidate_preview_timestamps(duration_sec: float | None) -> list[float]:
    if duration_sec is None or duration_sec <= 0:
        return [0.0]

    candidates: list[float] = []
    for raw_value in (duration_sec / 2.0, duration_sec / 3.0, min(1.0, duration_sec / 10.0), 0.0):
        timestamp = max(0.0, min(float(duration_sec), float(raw_value)))
        rounded = round(timestamp, 3)
        if rounded not in candidates:
            candidates.append(rounded)
    return candidates


def _extract_preview_frame_with_opencv(path: str, *, frame_count: int | None = None):
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        cap.release()
        return None

    try:
        for frame_index in _candidate_preview_frame_indices(frame_count):
            if frame_index > 0:
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
            else:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ok, frame = cap.read()
            if ok and frame is not None and getattr(frame, "size", 0) > 0:
                return frame

        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        for _ in range(5):
            ok, frame = cap.read()
            if ok and frame is not None and getattr(frame, "size", 0) > 0:
                return frame
    finally:
        cap.release()

    return None


def _extract_preview_frame_with_ffmpeg(path: str, *, duration_sec: float | None = None):
    ffmpeg_path = shutil.which("ffmpeg")
    if ffmpeg_path is None:
        raise RuntimeError("FFmpeg is required for video preview extraction.")

    with tempfile.TemporaryDirectory(prefix="video_preview_") as temp_dir:
        output_path = Path(temp_dir) / "preview.jpg"

        for timestamp in _candidate_preview_timestamps(duration_sec):
            command_variants = [
                [
                    ffmpeg_path,
                    "-y",
                    "-loglevel",
                    "error",
                    *([] if timestamp <= 0 else ["-ss", f"{timestamp:.3f}"]),
                    "-i",
                    path,
                    "-frames:v",
                    "1",
                    "-q:v",
                    "2",
                    str(output_path),
                ],
                [
                    ffmpeg_path,
                    "-y",
                    "-loglevel",
                    "error",
                    "-i",
                    path,
                    *([] if timestamp <= 0 else ["-ss", f"{timestamp:.3f}"]),
                    "-frames:v",
                    "1",
                    "-q:v",
                    "2",
                    str(output_path),
                ],
            ]

            for command in command_variants:
                try:
                    subprocess.run(
                        command,
                        check=True,
                        capture_output=True,
                        text=True,
                    )
                except Exception:
                    continue

                frame = cv2.imread(str(output_path))
                if frame is not None and getattr(frame, "size", 0) > 0:
                    return frame
                output_path.unlink(missing_ok=True)

    return None


def extract_video_preview_frame(path: str) -> np.ndarray:
    """Extract a representative video frame using OpenCV first, then FFmpeg fallback."""
    video_path = os.path.abspath(path)
    if not os.path.isfile(video_path):
        raise RuntimeError(f"Input not found: {video_path}")

    profile = read_video_profile(video_path)
    frame = _extract_preview_frame_with_opencv(
        video_path,
        frame_count=_coerce_positive_int(profile.get("frame_count")),
    )
    if frame is not None:
        return frame

    frame = _extract_preview_frame_with_ffmpeg(
        video_path,
        duration_sec=_coerce_positive_float(profile.get("duration_sec")),
    )
    if frame is not None:
        return frame

    raise RuntimeError("Unable to extract a preview frame from the uploaded video.")


def build_output_path(input_path: str, output_path: str | None, suffix: str = "_processed") -> str:
    """Build the output path from input path."""
    if output_path:
        return os.path.abspath(output_path if output_path.lower().endswith(".mp4") else output_path + ".mp4")
    base = os.path.splitext(os.path.basename(input_path))[0]
    return os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(input_path)), base + suffix + ".mp4"))


def load_model(model_path: str, task: str | None = None) -> YOLO:
    """Load a YOLO model."""
    try:
        if task:
            return YOLO(model_path, task=task)
        return YOLO(model_path)
    except Exception as e:
        raise RuntimeError(f"Failed to load model '{model_path}': {e}") from e


def run_tracking_inference(
    model: YOLO,
    frame,
    *,
    conf: float,
    device: str | None,
    classes: list[int] | None = None,
    iou: float = 0.70,
    tracker: str | None = None,
):
    """
    Prefer tracking when available, but fall back to plain prediction when
    tracker dependencies (for example `lap`) are unavailable.
    """
    track_kwargs = {
        "source": frame,
        "conf": conf,
        "device": device,
        "verbose": False,
        "iou": iou,
        "persist": True,
    }
    if classes is not None:
        track_kwargs["classes"] = classes
    if tracker:
        track_kwargs["tracker"] = tracker

    try:
        return model.track(**track_kwargs)
    except Exception:
        predict_kwargs = {
            "source": frame,
            "conf": conf,
            "device": device,
            "verbose": False,
        }
        if classes is not None:
            predict_kwargs["classes"] = classes
        return model.predict(**predict_kwargs)


def extract_detection_payload(results) -> tuple[list, list[int], list[int], list[float], dict]:
    """
    Normalize Ultralytics result payloads from both `track()` and `predict()`.
    """
    if not results or results[0].boxes is None:
        return [], [], [], [], {}

    det = results[0].boxes
    if det.xyxy is None or len(det.xyxy) == 0:
        return [], [], [], [], getattr(results[0], "names", {}) or {}

    boxes = det.xyxy.cpu().numpy()
    tids = (
        det.id.cpu().numpy().astype(int).tolist()
        if det.id is not None else list(range(len(boxes)))
    )
    class_ids = (
        det.cls.cpu().numpy().astype(int).tolist()
        if det.cls is not None else [0] * len(boxes)
    )
    confs = (
        det.conf.cpu().numpy().tolist()
        if det.conf is not None else [1.0] * len(boxes)
    )
    names = getattr(results[0], "names", {}) or {}
    return boxes, tids, class_ids, confs, names


# ── Drawing helpers ──────────────────────────────────────────────────────

FONT = cv2.FONT_HERSHEY_SIMPLEX

C_GREEN  = (0, 200, 0)
C_RED    = (0, 50, 230)
C_YELLOW = (0, 210, 230)
C_ORANGE = (0, 140, 255)
C_BLUE   = (230, 160, 50)
C_WHITE  = (255, 255, 255)
C_BLACK  = (0, 0, 0)
C_DARK   = (20, 20, 20)
C_GRAY   = (140, 140, 140)
C_CYAN   = (200, 220, 0)


def draw_label(frame, text: str, x: int, y: int, bg_color, text_color=C_WHITE, font_scale=0.45, thickness=1):
    """Draw a text label with background rectangle."""
    (tw, th), _ = cv2.getTextSize(text, FONT, font_scale, thickness)
    cv2.rectangle(frame, (x, y - th - 6), (x + tw + 8, y + 2), bg_color, -1)
    cv2.putText(frame, text, (x + 4, y - 2), FONT, font_scale, text_color, thickness, cv2.LINE_AA)


def draw_hud_panel(frame, title: str, lines: list[tuple[str, tuple]], x1: int = -1, y1: int = 6):
    """Draw a semi-transparent HUD panel in the corner."""
    fh, fw = frame.shape[:2]
    dw = 220
    dh = 24 + len(lines) * 20
    m = 6
    if x1 < 0:
        x1 = fw - dw - m
    x2, y2 = x1 + dw, y1 + dh

    ov = frame.copy()
    cv2.rectangle(ov, (x1, y1), (x2, y2), C_DARK, -1)
    cv2.addWeighted(ov, 0.82, frame, 0.18, 0, frame)
    cv2.rectangle(frame, (x1, y1), (x2, y2), (70, 70, 70), 1)

    y = y1 + 18
    cv2.putText(frame, title, (x1 + 7, y), FONT, 0.40, C_WHITE, 2, cv2.LINE_AA)
    y += 20

    for text, color in lines:
        cv2.putText(frame, text, (x1 + 7, y), FONT, 0.33, color, 1, cv2.LINE_AA)
        y += 18


def draw_alert_bar(frame, message: str):
    """Draw a flashing alert bar at the bottom of the frame."""
    fh, fw = frame.shape[:2]
    bh = 26
    flash = int(time.time() * 2.5) % 2 == 0
    ov = frame.copy()
    cv2.rectangle(ov, (0, fh - bh), (fw, fh), (0, 0, 190) if flash else (0, 0, 100), -1)
    cv2.addWeighted(ov, 0.75, frame, 0.25, 0, frame)
    (tw, th), _ = cv2.getTextSize(message, FONT, 0.44, 1)
    cv2.putText(frame, message, ((fw - tw) // 2, fh - bh // 2 + th // 2),
                FONT, 0.44, C_WHITE, 1, cv2.LINE_AA)
