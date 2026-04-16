"""
Region-Based Security Alert System
===================================
Sends email alerts ONLY when people are detected inside a defined zone.
Uses direct YOLO detection (no tracker) for guaranteed count-box consistency.

Setup:
    pip install -r requirements.txt
    python3 alert.py

The demo video and YOLO model are downloaded automatically on first run.
"""

import os
import smtplib
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import cv2
import numpy as np
from ultralytics import YOLO
from ultralytics.utils.downloads import safe_download
PASSWORD = "kckwdgtcgsflybdn"

# ─── Configuration ────────────────────────────────────────────────────────────

# All paths relative to this script's directory (works from any terminal cwd)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Video source
VIDEO_SOURCE = os.path.join(SCRIPT_DIR, "solutions-ci-demo.mp4")
DEMO_VIDEO_URL = "https://github.com/ultralytics/notebooks/releases/download/v0.0.0/solutions-ci-demo.mp4"

# Email credentials
FROM_EMAIL = "jyotsnasharma3333@gmail.com"
# App password from https://myaccount.google.com/apppasswords
TO_EMAIL = "jyotsnasharma3333@gmail.com"

# Detection settings
MODEL = os.path.join(SCRIPT_DIR, "yolo26n.pt")
CONFIDENCE = 0.15       # Low threshold to catch all people, even partially occluded
IOU_THRESHOLD = 0.9     # High IoU — only merge nearly-identical boxes
MAX_DETECTIONS = 100    # Max detections per frame
ALERT_THRESHOLD = 1     # Min people in zone to trigger alert

# Watch zone — polygon coordinates (x, y) within the video frame
# Adjust to match your camera/video. This default fits the 640x360 demo video.
REGION = np.array([(20, 150), (620, 150), (620, 350), (20, 350)], dtype=np.int32)

# Output
OUTPUT_FILE = os.path.join(SCRIPT_DIR, "security_output.mp4")

# Colors
BOX_COLOR = (0, 255, 128)         # Green bounding boxes
REGION_COLOR = (255, 255, 255)    # White region outline
COUNT_BG_COLOR = (30, 30, 30)     # Dark background for counter
COUNT_TEXT_COLOR = (0, 255, 200)   # Cyan-green text for count


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


# ─── SMTP Authentication ─────────────────────────────────────────────────────

server = smtplib.SMTP("smtp.gmail.com", 587)
server.starttls()
server.login(FROM_EMAIL, PASSWORD)
print("Email server authenticated successfully!")


# ─── Helper: check if a point is inside the region polygon ────────────────────

def is_inside_region(cx, cy):
    """Check if a point (cx, cy) is inside the REGION polygon."""
    return cv2.pointPolygonTest(REGION, (float(cx), float(cy)), False) >= 0


# ─── Email Alert Logic ────────────────────────────────────────────────────────

email_sent = False


def send_alert_email(frame, num_detections):
    """Send an email alert with the annotated frame attached."""
    global email_sent
    img_bytes = cv2.imencode(".jpg", frame)[1].tobytes()

    message = MIMEMultipart()
    message["From"] = FROM_EMAIL
    message["To"] = TO_EMAIL
    message["Subject"] = "🚨 Security Alert — Intrusion Detected in Zone"

    body = (
        f"ALERT: {num_detections} person(s) detected inside the restricted zone.\n\n"
        "See attached image for details."
    )
    message.attach(MIMEText(body))
    message.attach(MIMEImage(img_bytes, name="alert_snapshot.jpg"))

    try:
        server.send_message(message)
        print(f"✅ Alert email sent! ({num_detections} person(s) in zone)")
        email_sent = True
    except Exception as e:
        print(f"❌ Failed to send alert email: {e}")


# ─── Process Video ────────────────────────────────────────────────────────────

while cap.isOpened():
    success, frame = cap.read()
    if not success:
        print("Video frame is empty or video processing has been successfully completed.")
        break

    # Run detection — only class 0 (person)
    results = model(frame, conf=CONFIDENCE, iou=IOU_THRESHOLD,
                    max_det=MAX_DETECTIONS, classes=[0], verbose=False)

    detections = results[0].boxes

    # Draw the region boundary
    cv2.polylines(frame, [REGION], isClosed=True, color=REGION_COLOR, thickness=2)

    # Filter detections to those inside the region and draw boxes
    person_count = 0
    for box in detections.xyxy:
        x1, y1, x2, y2 = map(int, box)
        # Use bottom-center of bounding box as the person's "foot" position
        cx = (x1 + x2) // 2
        cy = y2
        if is_inside_region(cx, cy):
            cv2.rectangle(frame, (x1, y1), (x2, y2), BOX_COLOR, 2)
            person_count += 1

    # Draw person count on the top-right corner
    count_text = f"Persons in zone: {person_count}"
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.9
    thickness = 2
    (text_w, text_h), baseline = cv2.getTextSize(count_text, font, font_scale, thickness)

    pad = 12
    x_pos = w - text_w - pad * 2 - 10
    y_pos = 10

    # Semi-transparent background
    overlay = frame.copy()
    cv2.rectangle(overlay,
                  (x_pos, y_pos),
                  (x_pos + text_w + pad * 2, y_pos + text_h + pad * 2),
                  COUNT_BG_COLOR, -1)
    cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)

    # Border
    cv2.rectangle(frame,
                  (x_pos, y_pos),
                  (x_pos + text_w + pad * 2, y_pos + text_h + pad * 2),
                  COUNT_TEXT_COLOR, 2)

    # Text
    cv2.putText(frame, count_text,
                (x_pos + pad, y_pos + text_h + pad),
                font, font_scale, COUNT_TEXT_COLOR, thickness)

    # Send alert email (with the ANNOTATED frame, so boxes match the count)
    if person_count >= ALERT_THRESHOLD and not email_sent:
        send_alert_email(frame, person_count)

    video_writer.write(frame)

cap.release()
video_writer.release()

try:
    server.quit()
except Exception:
    pass

print(f"Done! Output saved to {OUTPUT_FILE}")
