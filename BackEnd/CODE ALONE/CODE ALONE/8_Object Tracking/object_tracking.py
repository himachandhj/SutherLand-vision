"""
Object Tracking using YOLO11 + ByteTrack + OpenCV
Saves output as .mp4 with bounding boxes, track IDs, FPS overlay.

Requirements (requirements.txt):
    ultralytics>=8.3.0
    opencv-python>=4.8.0
    torch>=2.0.0

Install command:
    pip install ultralytics opencv-python torch

Run command:
    python3 object_tracking.py --input your_video.mp4

Optional arguments:
    --output    output filename (default: <input>_tracked.mp4)
    --model     YOLO model weights (default: yolo11m.pt)
    --classes   class IDs to track, space-separated (default: 0 = person)
                e.g. --classes 0 2 5   (person, car, bus)
    --tracker   tracker config (default: bytetrack.yaml)
    --conf      confidence threshold (default: 0.3)
    --device    device to run on: cpu / 0 / cuda (default: auto)

Example:
    python3 object_tracking.py --input test.mp4 --output result.mp4 --classes 0
"""

import argparse
import os
import sys
import time
import logging

# ── Graceful import checks ────────────────────────────────────────────────────
try:
    import cv2
except ImportError:
    sys.exit("[ERROR] opencv-python not found. Run: pip install opencv-python")

try:
    from ultralytics import YOLO
except ImportError:
    sys.exit("[ERROR] ultralytics not found. Run: pip install ultralytics")

# ── Logging setup ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="[%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)


# ── Argument parser ───────────────────────────────────────────────────────────
def parse_args():
    parser = argparse.ArgumentParser(
        description="YOLO11 Object Tracking — saves output as .mp4"
    )
    parser.add_argument(
        "--input", "-i", required=True, help="Path to input video file"
    )
    parser.add_argument(
        "--output", "-o", default=None, help="Path to output .mp4 file"
    )
    parser.add_argument(
        "--model", "-m", default="yolo11m.pt", help="YOLO model weights file"
    )
    parser.add_argument(
        "--classes",
        nargs="+",
        type=int,
        default=[0],
        help="Class IDs to track (default: 0 = person)",
    )
    parser.add_argument(
        "--tracker",
        default="bytetrack.yaml",
        help="Tracker config (default: bytetrack.yaml)",
    )
    parser.add_argument(
        "--conf",
        type=float,
        default=0.3,
        help="Detection confidence threshold (default: 0.3)",
    )
    parser.add_argument(
        "--device",
        default=None,
        help="Device: cpu / 0 / cuda (default: auto-detect)",
    )
    return parser.parse_args()


# ── Helpers ───────────────────────────────────────────────────────────────────
def build_output_path(input_path: str, output_arg) -> str:
    """Derive output path, always ending in .mp4."""
    if output_arg:
        path = output_arg if output_arg.lower().endswith(".mp4") else output_arg + ".mp4"
    else:
        base = os.path.splitext(os.path.basename(input_path))[0]
        path = f"{base}_tracked.mp4"
    return path


def open_video(path: str) -> cv2.VideoCapture:
    if not os.path.isfile(path):
        sys.exit(f"[ERROR] Input file not found: {path}")
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        sys.exit(f"[ERROR] Cannot open video: {path}")
    return cap


def get_video_properties(cap: cv2.VideoCapture):
    width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps    = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total  = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    return width, height, fps, total


def create_writer(output_path: str, width: int, height: int, fps: float) -> cv2.VideoWriter:
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    if not writer.isOpened():
        sys.exit(f"[ERROR] Cannot create output video writer at: {output_path}")
    return writer


def overlay_text(frame, fps_display: float, proc_time: float, frame_idx: int, total: int):
    """Draw FPS, processing time, and frame counter on frame."""
    h, w = frame.shape[:2]
    font       = cv2.FONT_HERSHEY_SIMPLEX
    scale      = max(0.5, w / 1280)
    thickness  = max(1, int(scale * 2))
    pad        = int(10 * scale)
    line_h     = int(35 * scale)
    color      = (0, 255, 0)
    shadow     = (0, 0, 0)

    lines = [
        f"FPS: {fps_display:.1f}",
        f"Proc: {proc_time * 1000:.1f} ms",
        f"Frame: {frame_idx}/{total}" if total > 0 else f"Frame: {frame_idx}",
    ]
    for i, text in enumerate(lines):
        y = pad + (i + 1) * line_h
        cv2.putText(frame, text, (pad + 1, y + 1), font, scale, shadow, thickness + 1)
        cv2.putText(frame, text, (pad, y),         font, scale, color,  thickness)


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    args = parse_args()

    input_path  = args.input
    output_path = build_output_path(input_path, args.output)

    log.info("Input  : %s", input_path)
    log.info("Output : %s", output_path)
    log.info("Model  : %s", args.model)
    log.info("Classes: %s", args.classes)
    log.info("Tracker: %s", args.tracker)
    log.info("Conf   : %s", args.conf)

    # ── Load model ────────────────────────────────────────────────────────────
    try:
        log.info("Loading YOLO model …")
        model = YOLO(args.model)
        log.info("Model loaded.")
    except FileNotFoundError:
        sys.exit(f"[ERROR] Model file not found: {args.model}")
    except Exception as e:
        sys.exit(f"[ERROR] Failed to load model: {e}")

    # ── Open video ────────────────────────────────────────────────────────────
    cap = open_video(input_path)
    width, height, src_fps, total_frames = get_video_properties(cap)
    log.info("Video  : %dx%d @ %.2f fps, %d frames", width, height, src_fps, total_frames)

    writer = create_writer(output_path, width, height, src_fps)

    # ── Tracking loop ─────────────────────────────────────────────────────────
    frame_count   = 0
    failed_frames = 0
    start_time    = time.time()

    log.info("Starting tracking … (press Ctrl+C to stop early)")

    try:
        while cap.isOpened():
            success, frame = cap.read()

            if not success:
                # Distinguish end-of-video from a read error
                if cap.get(cv2.CAP_PROP_POS_FRAMES) >= total_frames and total_frames > 0:
                    #log.info("End of video reached.")
                else:
                    failed_frames += 1
                    if failed_frames > 10:
                        log.warning("Too many consecutive read failures — stopping.")
                        break
                    log.warning("Frame read failed (attempt %d/10), skipping …", failed_frames)
                continue

            failed_frames = 0  # reset on successful read
            frame_count  += 1
            t0 = time.time()

            # ── Run tracking ──────────────────────────────────────────────
            try:
                results = model.track(
                    frame,
                    classes=args.classes,
                    persist=True,
                    tracker=args.tracker,
                    conf=args.conf,
                    verbose=False,
                    device=args.device,
                )
                annotated = results[0].plot()
            except Exception as e:
                log.error("Tracking failed on frame %d: %s — writing raw frame.", frame_count, e)
                annotated = frame

            proc_time = time.time() - t0

            # ── FPS overlay ───────────────────────────────────────────────
            elapsed = time.time() - start_time
            live_fps = frame_count / elapsed if elapsed > 0 else 0.0
            overlay_text(annotated, live_fps, proc_time, frame_count, total_frames)

            # ── Write frame ───────────────────────────────────────────────
            writer.write(annotated)

            # ── Progress log every 50 frames ──────────────────────────────
            if frame_count % 50 == 0:
                pct = f"{100 * frame_count / total_frames:.1f}%" if total_frames > 0 else "?"
                log.info("Processed %d frames (%s) | FPS: %.1f", frame_count, pct, live_fps)

    except KeyboardInterrupt:
        log.info("Interrupted by user after %d frames.", frame_count)

    finally:
        cap.release()
        writer.release()
        cv2.destroyAllWindows()

    # ── Summary ───────────────────────────────────────────────────────────────
    total_time = time.time() - start_time
    avg_fps    = frame_count / total_time if total_time > 0 else 0.0

    log.info("─" * 50)
    log.info("Done! Processed %d frames in %.1fs (avg %.1f FPS)", frame_count, total_time, avg_fps)
    log.info("Output saved to: %s", os.path.abspath(output_path))

    if not os.path.isfile(output_path) or os.path.getsize(output_path) == 0:
        log.error("Output file is missing or empty — something went wrong.")
        sys.exit(1)


if __name__ == "__main__":
    main()
