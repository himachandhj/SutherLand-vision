"""
Queue Management using Ultralytics YOLO Solutions
===================================================

This script monitors objects (people) in a queue using Ultralytics YOLO
object detection and queue management solution.

Usage:
    python queue_management.py --input <video_file>
    python queue_management.py --input <video_file> --output <output_file.mp4>
    python queue_management.py --input <video_file> --model yolo26s.pt --show

Examples:
    python queue_management.py --input crowd_video.mp4
    python queue_management.py --input crowd_video.mp4 --output result.mp4 --show
    python queue_management.py --input crowd_video.mp4 --model yolo26m.pt --conf 0.3

Notes:
    - The output video is always saved as .mp4 (H.264 codec).
    - If no --output is specified, the output is saved as 'queue_output.mp4'
      in the same directory as the input video.
    - The YOLO model weights are downloaded automatically on first run.
    - Audio from the input video is preserved in the output if ffmpeg is available.
"""

import argparse
import os
import platform
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import cv2
from ultralytics import solutions


def parse_args():
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Queue Management using Ultralytics YOLO Solutions",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python queue_management.py --input video.mp4
  python queue_management.py --input video.mp4 --output result.mp4
  python queue_management.py --input video.mp4 --model yolo26s.pt --show
  python queue_management.py --input video.mp4 --region 57,271 295,669 879,521 315,215
        """,
    )

    parser.add_argument(
        "--input", "-i",
        type=str,
        required=True,
        help="Path to the input video file (e.g., crowd_video.mp4)",
    )
    parser.add_argument(
        "--output", "-o",
        type=str,
        default=None,
        help="Path to save the output .mp4 video (default: queue_output.mp4 in input dir)",
    )
    parser.add_argument(
        "--model", "-m",
        type=str,
        default="yolo26m.pt",
        help="YOLO model to use (default: yolo26m.pt). Options: yolo26n.pt, yolo26s.pt, yolo26m.pt, yolo26l.pt, yolo26x.pt",
    )
    parser.add_argument(
        "--region",
        type=str,
        nargs="+",
        default=None,
        help="Queue region coordinates as pairs: x1,y1 x2,y2 x3,y3 x4,y4 (default: full-frame region)",
    )
    parser.add_argument(
        "--classes",
        type=int,
        nargs="+",
        default=[0],
        help="COCO class IDs to detect (default: 0 = person). E.g., --classes 0 2 for person and car.",
    )
    parser.add_argument(
        "--conf",
        type=float,
        default=0.25,
        help="Confidence threshold for detections (default: 0.25)",
    )
    parser.add_argument(
        "--iou",
        type=float,
        default=0.7,
        help="IoU threshold for NMS (default: 0.7)",
    )
    parser.add_argument(
        "--line-width",
        type=int,
        default=3,
        help="Line width for bounding boxes and text (default: 3)",
    )
    parser.add_argument(
        "--show",
        action="store_true",
        default=False,
        help="Display the output video in a window while processing",
    )
    parser.add_argument(
        "--no-audio",
        action="store_true",
        default=False,
        help="Skip copying audio from input to output video",
    )
    parser.add_argument(
        "--device",
        type=str,
        default=None,
        help="Device to run inference on (e.g., 'cpu', '0' for GPU 0, 'mps' for Apple Silicon)",
    )

    return parser.parse_args()


def check_ffmpeg():
    """Check if ffmpeg is available on the system."""
    return shutil.which("ffmpeg") is not None


def has_audio_stream(video_path):
    """Check if the input video has an audio stream using ffprobe."""
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return False
    try:
        result = subprocess.run(
            [
                ffprobe, "-v", "error",
                "-select_streams", "a:0",
                "-show_entries", "stream=codec_type",
                "-of", "csv=p=0",
                video_path,
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )
        return "audio" in result.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False


def mux_audio(video_no_audio, original_video, output_path):
    """
    Merge processed video (no audio) with audio from the original video
    using ffmpeg. Returns True on success.
    """
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return False

    try:
        cmd = [
            ffmpeg, "-y",
            "-i", video_no_audio,
            "-i", original_video,
            "-c:v", "copy",
            "-c:a", "aac",
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-shortest",
            output_path,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        return result.returncode == 0
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False


def parse_region(region_args, frame_width, frame_height):
    """
    Parse region coordinates from CLI arguments.
    Returns a list of (x, y) tuples.

    If no region is provided, returns a default region covering most of the frame.
    """
    if region_args is None:
        # Default: a rectangle region covering 80% of the frame (centered)
        margin_x = int(frame_width * 0.1)
        margin_y = int(frame_height * 0.1)
        return [
            (margin_x, margin_y),
            (margin_x, frame_height - margin_y),
            (frame_width - margin_x, frame_height - margin_y),
            (frame_width - margin_x, margin_y),
        ]

    coords = []
    for pair in region_args:
        try:
            x, y = pair.split(",")
            coords.append((int(x.strip()), int(y.strip())))
        except ValueError:
            print(f"[ERROR] Invalid region coordinate: '{pair}'. Expected format: x,y")
            sys.exit(1)

    if len(coords) < 3:
        print("[ERROR] At least 3 region points are required to form a polygon.")
        sys.exit(1)

    return coords


def detect_device():
    """Auto-detect the best available device."""
    import torch

    if torch.cuda.is_available():
        return "0"  # First CUDA GPU
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"  # Apple Silicon GPU
    else:
        return "cpu"


def main():
    args = parse_args()

    # ── Validate input ──────────────────────────────────────────────
    input_path = os.path.abspath(args.input)
    if not os.path.isfile(input_path):
        print(f"[ERROR] Input video not found: {input_path}")
        sys.exit(1)

    # ── Output path ─────────────────────────────────────────────────
    if args.output:
        output_path = os.path.abspath(args.output)
    else:
        input_dir = os.path.dirname(input_path)
        output_path = os.path.join(input_dir, "queue_output.mp4")

    # Ensure output has .mp4 extension
    if not output_path.lower().endswith(".mp4"):
        output_path += ".mp4"

    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    # ── Device selection ────────────────────────────────────────────
    device = args.device if args.device else detect_device()

    # ── Open video ──────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print(f"  Queue Management - Ultralytics YOLO")
    print(f"{'='*60}")
    print(f"  Input  : {input_path}")
    print(f"  Output : {output_path}")
    print(f"  Model  : {args.model}")
    print(f"  Device : {device}")
    print(f"  Classes: {args.classes}")
    print(f"  Conf   : {args.conf}")
    print(f"  IoU    : {args.iou}")
    print(f"{'='*60}\n")

    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        print(f"[ERROR] Cannot open video file: {input_path}")
        sys.exit(1)

    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    if fps <= 0:
        fps = 30.0
        print(f"[WARN] Could not read FPS from video, defaulting to {fps}")

    print(f"  Video info: {w}x{h} @ {fps:.1f} FPS, {total_frames} frames")

    # ── Parse region coordinates ────────────────────────────────────
    queue_region = parse_region(args.region, w, h)
    print(f"  Queue region: {queue_region}\n")

    # ── Determine if we need to handle audio ────────────────────────
    needs_audio = not args.no_audio and has_audio_stream(input_path) and check_ffmpeg()

    # If we need audio, write video to a temp file first, then mux
    if needs_audio:
        temp_dir = tempfile.mkdtemp(prefix="queue_mgmt_")
        temp_video = os.path.join(temp_dir, "temp_video.mp4")
        video_out_path = temp_video
    else:
        video_out_path = output_path

    # ── Video writer (H.264 in MP4 container) ──────────────────────
    # Try H.264 codec first, fall back to mp4v
    fourcc_options = [
        ("avc1", "H.264 (avc1)"),
        ("h264", "H.264 (h264)"),
        ("mp4v", "MPEG-4 (mp4v)"),
    ]

    video_writer = None
    for fourcc_str, codec_name in fourcc_options:
        fourcc = cv2.VideoWriter_fourcc(*fourcc_str)
        video_writer = cv2.VideoWriter(video_out_path, fourcc, fps, (w, h))
        if video_writer.isOpened():
            print(f"  Using codec: {codec_name}")
            break
        video_writer.release()
        video_writer = None

    if video_writer is None:
        print("[ERROR] Could not initialize video writer with any codec.")
        print("        Make sure OpenCV is installed with video codec support.")
        cap.release()
        sys.exit(1)

    # ── Initialize QueueManager ─────────────────────────────────────
    queuemanager = solutions.QueueManager(
        show=args.show,
        region=queue_region,
        model=args.model,
        classes=args.classes,
        line_width=args.line_width,
        conf=args.conf,
        iou=args.iou,
        device=device,
    )

    # ── Process frames ──────────────────────────────────────────────
    frame_count = 0
    print("\n  Processing frames...")

    try:
        while cap.isOpened():
            success, frame = cap.read()
            if not success:
                break

            frame_count += 1
            results = queuemanager(frame)
            video_writer.write(results.plot_im)

            # Progress bar
            if total_frames > 0:
                progress = frame_count / total_frames * 100
                bar_len = 40
                filled = int(bar_len * frame_count / total_frames)
                bar = "█" * filled + "░" * (bar_len - filled)
                print(f"\r  [{bar}] {progress:5.1f}% ({frame_count}/{total_frames})", end="", flush=True)

    except KeyboardInterrupt:
        print("\n\n  [INFO] Processing interrupted by user.")

    finally:
        cap.release()
        video_writer.release()
        if args.show:
            cv2.destroyAllWindows()

    print(f"\n\n  Processed {frame_count} frames.")

    # ── Mux audio if needed ─────────────────────────────────────────
    if needs_audio:
        print("  Merging audio from original video...")
        success = mux_audio(temp_video, input_path, output_path)
        if success:
            print("  ✓ Audio merged successfully.")
        else:
            print("  [WARN] Could not merge audio. Saving video without audio.")
            shutil.copy2(temp_video, output_path)

        # Clean up temp files
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception:
            pass

    # ── Done ────────────────────────────────────────────────────────
    output_size = os.path.getsize(output_path) / (1024 * 1024)
    print(f"\n{'='*60}")
    print(f"  ✓ Output saved to: {output_path}")
    print(f"  ✓ Output size: {output_size:.1f} MB")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
