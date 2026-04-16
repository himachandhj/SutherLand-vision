"""
Shared utilities for all use case video processors.
"""

import os
import sys
import time
import warnings

warnings.filterwarnings("ignore")

import cv2
import numpy as np
from ultralytics import YOLO


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


def create_writer(path: str, fps: float, w: int, h: int) -> cv2.VideoWriter:
    """Create an MP4 video writer."""
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    for cc in ("avc1", "h264", "H264", "mp4v"):
        wr = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*cc), fps, (w, h))
        if wr.isOpened():
            return wr
        wr.release()
    raise RuntimeError("No MP4 codec available.")


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
