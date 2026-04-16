"""
Simple Person Counter
=====================
Detects and counts people in a video. Shows bounding boxes and a
live person count on screen. No regions, no IDs, no probabilities.

Setup:
    pip install -r requirements.txt
    python3 count.py

The demo video and YOLO model are downloaded automatically on first run.
"""

import os

import cv2
import numpy as np
from ultralytics import YOLO
from ultralytics.utils.downloads import safe_download


# ─── Configuration ────────────────────────────────────────────────────────────

# All paths relative to this script's directory (works from any terminal cwd)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

VIDEO_SOURCE = os.path.join(SCRIPT_DIR, "solutions-ci-demo.mp4")
DEMO_VIDEO_URL = "https://github.com/ultralytics/notebooks/releases/download/v0.0.0/solutions-ci-demo.mp4"

MODEL = os.path.join(SCRIPT_DIR, "yolo26n.pt")
CONFIDENCE = 0.15       # Low threshold to catch all people, even partially occluded
IOU_THRESHOLD = 0.9     # High IoU threshold — only merge nearly-identical boxes
MAX_DETECTIONS = 100    # Allow up to 100 detections per frame
OUTPUT_FILE = os.path.join(SCRIPT_DIR, "person_count_output.mp4")

# Colors
BOX_COLOR = (0, 255, 128)       # Green bounding boxes
COUNT_BG_COLOR = (30, 30, 30)   # Dark background for counter
COUNT_TEXT_COLOR = (0, 255, 200) # Cyan-green text for count


# ─── Auto-download demo video if not present ──────────────────────────────────

if not os.path.exists(VIDEO_SOURCE):
    print(f"Downloading demo video to {VIDEO_SOURCE}...")
    safe_download(DEMO_VIDEO_URL, dir=SCRIPT_DIR)
    print("Download complete!")


# ─── Video Input ──────────────────────────────────────────────────────────────

cap = cv2.VideoCapture(VIDEO_SOURCE)
assert cap.isOpened(), f"Error: cannot open video '{VIDEO_SOURCE}'"

w, h, fps = (int(cap.get(x)) for x in (
    cv2.CAP_PROP_FRAME_WIDTH, cv2.CAP_PROP_FRAME_HEIGHT, cv2.CAP_PROP_FPS))

video_writer = cv2.VideoWriter(
    OUTPUT_FILE, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))


# ─── Load YOLO Model ─────────────────────────────────────────────────────────

model = YOLO(MODEL)


# ─── Process Video ────────────────────────────────────────────────────────────

while cap.isOpened():
    success, frame = cap.read()
    if not success:
        print("Video frame is empty or processing is complete.")
        break

    # Run detection — only class 0 (person)
    results = model(frame, conf=CONFIDENCE, iou=IOU_THRESHOLD,
                    max_det=MAX_DETECTIONS, classes=[0], verbose=False)

    # Count persons
    detections = results[0].boxes
    person_count = len(detections)

    # Draw clean bounding boxes (no labels, no confidence)
    for box in detections.xyxy:
        x1, y1, x2, y2 = map(int, box)
        cv2.rectangle(frame, (x1, y1), (x2, y2), BOX_COLOR, 2)

    # Draw person count on the top-right corner
    count_text = f"Persons: {person_count}"
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.9
    thickness = 2
    (text_w, text_h), baseline = cv2.getTextSize(count_text, font, font_scale, thickness)

    # Position: top-right with padding
    pad = 12
    x_pos = w - text_w - pad * 2 - 10
    y_pos = 10

    # Background rectangle
    overlay = frame.copy()
    cv2.rectangle(overlay,
                  (x_pos, y_pos),
                  (x_pos + text_w + pad * 2, y_pos + text_h + pad * 2),
                  COUNT_BG_COLOR, -1)
    cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)  # Semi-transparent

    # Rounded border
    cv2.rectangle(frame,
                  (x_pos, y_pos),
                  (x_pos + text_w + pad * 2, y_pos + text_h + pad * 2),
                  COUNT_TEXT_COLOR, 2)

    # Text
    cv2.putText(frame, count_text,
                (x_pos + pad, y_pos + text_h + pad),
                font, font_scale, COUNT_TEXT_COLOR, thickness)

    video_writer.write(frame)

cap.release()
video_writer.release()

print(f"Done! Output saved to {OUTPUT_FILE}")
