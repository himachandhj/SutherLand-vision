#!/usr/bin/env python3
"""
Fire & Smoke Detection from Video using YOLO (Ultralytics)
===========================================================
This script takes an input .mp4 video, runs fire/smoke detection on each frame,
draws bounding boxes with labels and confidence scores, and saves the annotated
output video as "fire detection and smoke.mp4" in the same folder as the input.

Usage:
    python3 fire_smoke_detector.py <input_video.mp4>
    python3 fire_smoke_detector.py <input_video.mp4> --model <path_to_model.pt>
    python3 fire_smoke_detector.py <input_video.mp4> --confidence 0.4

Requirements (auto-installed on first run):
    pip3 install ultralytics opencv-python-headless requests
"""

import argparse
import os
import sys
import subprocess
import time


# ──────────────────────────────────────────────────────────────────────────────
# 1. Auto-install dependencies
# ──────────────────────────────────────────────────────────────────────────────
def install_dependencies():
    """Install required packages if not already present."""
    packages = {
        "ultralytics": "ultralytics",
        "cv2": "opencv-python-headless",
        "requests": "requests",
    }
    missing = []
    for import_name, pip_name in packages.items():
        try:
            __import__(import_name)
        except ImportError:
            missing.append(pip_name)

    if missing:
        print(f"[SETUP] Installing missing packages: {', '.join(missing)} ...")
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install"] + missing + ["-q"]
        )
    print("[SETUP] All dependencies are ready.\n")


install_dependencies()

import cv2
import requests
from ultralytics import YOLO


# ──────────────────────────────────────────────────────────────────────────────
# 2. Model download / loading
# ──────────────────────────────────────────────────────────────────────────────
MODEL_DIR = os.path.join(os.path.expanduser("~"), ".fire_smoke_model")
MODEL_PATH = os.path.join(MODEL_DIR, "fire_smoke_yolov8n.pt")

# Direct GitHub raw download URLs (public repos, no auth required)
MODEL_URLS = [
    # luminous0219 — YOLOv8n trained 150 epochs on fire+smoke (Roboflow dataset)
    "https://github.com/luminous0219/fire-and-smoke-detection-yolov8/raw/main/weights/best.pt",
    # Nocluee100 — YOLOv8 fire+smoke+bright-light detection
    "https://github.com/Nocluee100/Fire-and-Smoke-Detection-yolov8-v1/raw/main/best.pt",
]


def download_model() -> str:
    """Download a pre-trained fire/smoke YOLO model from GitHub."""
    if os.path.isfile(MODEL_PATH):
        print(f"[MODEL] Found cached model at {MODEL_PATH}")
        return MODEL_PATH

    os.makedirs(MODEL_DIR, exist_ok=True)

    for url in MODEL_URLS:
        print(f"[MODEL] Trying to download from:\n        {url}")
        try:
            resp = requests.get(url, stream=True, timeout=60, allow_redirects=True)
            resp.raise_for_status()

            total = int(resp.headers.get("content-length", 0))
            downloaded = 0

            with open(MODEL_PATH, "wb") as f:
                for chunk in resp.iter_content(chunk_size=1024 * 1024):
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total > 0:
                        pct = downloaded / total * 100
                        mb = downloaded / 1024 / 1024
                        print(f"        {mb:.1f} MB ({pct:.0f}%)", end="\r")

            size = os.path.getsize(MODEL_PATH)
            if size < 1_000_000:  # sanity check: model should be > 1 MB
                print(f"\n[WARN] Downloaded file too small ({size} bytes), trying next URL ...")
                os.remove(MODEL_PATH)
                continue

            print(f"\n[MODEL] Model saved to {MODEL_PATH} ({size / 1024 / 1024:.1f} MB)\n")
            return MODEL_PATH

        except Exception as e:
            print(f"\n[WARN] Download failed: {e}")
            if os.path.exists(MODEL_PATH):
                os.remove(MODEL_PATH)
            continue

    print("\n[ERROR] Could not download any model automatically.")
    print("[ERROR] Please provide your own model via --model <path_to_model.pt>")
    print("[TIP]   You can train one in Google Colab using your reference notebook,")
    print("        then download the best.pt and pass it with --model best.pt\n")
    sys.exit(1)


def load_model(model_path: str | None) -> YOLO:
    """Load the YOLO model from a local path or download if needed."""
    if model_path and os.path.isfile(model_path):
        print(f"[MODEL] Loading custom model: {model_path}")
        path = model_path
    else:
        if model_path:
            print(f"[WARN] Model not found at '{model_path}', downloading default ...")
        path = download_model()

    model = YOLO(path)
    print(f"[MODEL] Loaded successfully. Detected classes: {model.names}\n")
    return model


# ──────────────────────────────────────────────────────────────────────────────
# 3. Colour palette for bounding boxes (BGR format for OpenCV)
# ──────────────────────────────────────────────────────────────────────────────
BOX_COLOURS = {
    "fire":    (0, 0, 255),      # Red
    "flame":   (0, 80, 255),     # Orange-red
    "smoke":   (200, 200, 0),    # Cyan
    "default": (0, 255, 0),      # Green
}


def get_colour(class_name: str) -> tuple:
    name = class_name.lower()
    for key, colour in BOX_COLOURS.items():
        if key in name:
            return colour
    return BOX_COLOURS["default"]


# ──────────────────────────────────────────────────────────────────────────────
# 4. Video processing
# ──────────────────────────────────────────────────────────────────────────────
def process_video(
    input_path: str,
    model: YOLO,
    confidence: float = 0.30,
    output_name: str = "fire detection and smoke.mp4",
):
    if not os.path.isfile(input_path):
        print(f"[ERROR] Input video not found: {input_path}")
        sys.exit(1)

    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        print(f"[ERROR] Cannot open video: {input_path}")
        sys.exit(1)

    # Video properties
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    # Output path — same folder as input
    input_dir = os.path.dirname(os.path.abspath(input_path))
    output_path = os.path.join(input_dir, output_name)

    # Use mp4v codec (works everywhere on Mac without extra dependencies)
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    if not writer.isOpened():
        print(f"[ERROR] Cannot create output video at {output_path}")
        sys.exit(1)

    print("=" * 60)
    print("  FIRE & SMOKE DETECTION")
    print("=" * 60)
    print(f"  Input  : {input_path}")
    print(f"  Output : {output_path}")
    print(f"  Resolution : {width}x{height} @ {fps:.1f} FPS")
    print(f"  Total frames : {total_frames}")
    print(f"  Confidence   : {confidence}")
    print("=" * 60)
    print()

    frame_idx = 0
    detection_count = 0
    start_time = time.time()

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame_idx += 1

        # Run YOLO inference on the frame
        results = model.predict(
            source=frame,
            conf=confidence,
            verbose=False,
            imgsz=640,
        )

        # Draw bounding boxes on the frame
        for result in results:
            if result.boxes is None:
                continue
            for box in result.boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                conf_score = float(box.conf[0])
                cls_id = int(box.cls[0])
                class_name = model.names.get(cls_id, f"class_{cls_id}")

                colour = get_colour(class_name)
                label = f"{class_name} {conf_score:.0%}"

                # Draw bounding box
                cv2.rectangle(frame, (x1, y1), (x2, y2), colour, 2)

                # Label background + text
                font = cv2.FONT_HERSHEY_SIMPLEX
                font_scale = 0.7
                thickness = 2
                (tw, th), baseline = cv2.getTextSize(label, font, font_scale, thickness)

                cv2.rectangle(
                    frame,
                    (x1, max(y1 - th - baseline - 6, 0)),
                    (x1 + tw + 4, y1),
                    colour,
                    cv2.FILLED,
                )
                cv2.putText(
                    frame,
                    label,
                    (x1 + 2, max(y1 - baseline - 3, th)),
                    font,
                    font_scale,
                    (255, 255, 255),
                    thickness,
                    cv2.LINE_AA,
                )
                detection_count += 1

        writer.write(frame)

        # Progress bar
        if frame_idx % 30 == 0 or frame_idx == total_frames:
            elapsed = time.time() - start_time
            fps_actual = frame_idx / elapsed if elapsed > 0 else 0
            pct = (frame_idx / total_frames * 100) if total_frames > 0 else 0
            bar_len = 30
            filled = int(bar_len * frame_idx / max(total_frames, 1))
            bar = "█" * filled + "░" * (bar_len - filled)
            print(
                f"  [{bar}] {pct:5.1f}%  "
                f"frame {frame_idx}/{total_frames}  "
                f"{fps_actual:.1f} fps  ",
                end="\r",
            )

    cap.release()
    writer.release()

    elapsed = time.time() - start_time
    print()
    print()
    print("=" * 60)
    print(f"  DONE!")
    print(f"  Processed {frame_idx} frames in {elapsed:.1f}s")
    print(f"  Total detections drawn: {detection_count}")
    print(f"  Output saved to:")
    print(f"    {output_path}")
    print("=" * 60)
    print()


# ──────────────────────────────────────────────────────────────────────────────
# 5. CLI entry point
# ──────────────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="Fire & Smoke Detection on Video using YOLO",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 fire_smoke_detector.py input.mp4
  python3 fire_smoke_detector.py input.mp4 --model my_custom_model.pt
  python3 fire_smoke_detector.py input.mp4 --confidence 0.4
  python3 fire_smoke_detector.py input.mp4 --output "result.mp4"
        """,
    )
    parser.add_argument("input", help="Path to input .mp4 video file")
    parser.add_argument(
        "--model",
        default=None,
        help="Path to a custom YOLO .pt model file (default: auto-download)",
    )
    parser.add_argument(
        "--confidence",
        type=float,
        default=0.30,
        help="Detection confidence threshold 0.0-1.0 (default: 0.30)",
    )
    parser.add_argument(
        "--output",
        default="fire detection and smoke.mp4",
        help='Output filename (default: "fire detection and smoke.mp4")',
    )

    args = parser.parse_args()

    if not os.path.isfile(args.input):
        print(f"[ERROR] Input file not found: {args.input}")
        sys.exit(1)

    model = load_model(args.model)
    process_video(
        input_path=args.input,
        model=model,
        confidence=args.confidence,
        output_name=args.output,
    )


if __name__ == "__main__":
    main()
