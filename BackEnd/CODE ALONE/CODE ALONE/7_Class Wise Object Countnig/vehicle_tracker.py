#!/usr/bin/env python3
"""
Class-wise Vehicle Detection, Tracking & Counting using YOLO
==============================================================
Detects, tracks, and counts vehicles (and other objects) crossing two
counting lines in a video.  Uses position-history per track ID so that
every line crossing is reliably captured and the on-screen dashboard
updates in real time.

Usage:
    python3 vehicle_tracker.py input.mp4
    python3 vehicle_tracker.py input.mp4 --classes car truck bus motorcycle
    python3 vehicle_tracker.py input.mp4 --red-line 0.40 --blue-line 0.55

Requirements (auto-installed on first run):
    pip3 install ultralytics opencv-python-headless
"""

import argparse
import os
import sys
import subprocess
import shutil
import time
from collections import defaultdict


# ──────────────────────────────────────────────────────────────────────────────
# 1. Auto-install dependencies
# ──────────────────────────────────────────────────────────────────────────────
def install_dependencies():
    packages = {"ultralytics": "ultralytics", "cv2": "opencv-python-headless"}
    missing = [pip for imp, pip in packages.items() if not _can_import(imp)]
    if missing:
        print(f"[SETUP] Installing: {', '.join(missing)} ...")
        subprocess.check_call([sys.executable, "-m", "pip", "install"] + missing + ["-q"])
    print("[SETUP] All dependencies are ready.\n")


def _can_import(name):
    try:
        __import__(name)
        return True
    except ImportError:
        return False


install_dependencies()

import cv2
from ultralytics import YOLO


# ──────────────────────────────────────────────────────────────────────────────
# 2. Smart video writer (fixes blur/ghosting on Mac)
# ──────────────────────────────────────────────────────────────────────────────
def create_video_writer(output_path: str, fps: float, width: int, height: int):
    """
    Try codecs in order of quality.  On macOS the 'avc1' (H.264) codec
    produces clean output.  Fall back to 'mp4v' only as last resort.
    If ffmpeg is available we will re-encode at the end for best quality.
    """
    # Try H.264 first (native on macOS), then XVID, then mp4v
    codecs_to_try = [
        ("avc1", ".mp4"),   # H.264 — best on macOS
        ("XVID", ".avi"),   # XVID — good fallback
        ("mp4v", ".mp4"),   # mp4v — last resort
    ]

    for codec_tag, ext in codecs_to_try:
        fourcc = cv2.VideoWriter_fourcc(*codec_tag)
        # If output_path extension doesn't match, adjust temp path
        temp_path = output_path
        if not output_path.lower().endswith(ext):
            temp_path = output_path.rsplit(".", 1)[0] + f"_temp{ext}"

        writer = cv2.VideoWriter(temp_path, fourcc, fps, (width, height))
        if writer.isOpened():
            print(f"[VIDEO] Using codec: {codec_tag} → {temp_path}")
            return writer, temp_path, codec_tag
        writer.release()

    print("[ERROR] No working video codec found!")
    sys.exit(1)


def finalise_video(temp_path: str, final_path: str, codec_used: str):
    """
    If we wrote to a temp file or used a lossy codec, re-encode with ffmpeg
    for a clean, universally playable .mp4.
    """
    if temp_path == final_path and codec_used == "avc1":
        # Already good — H.264 mp4
        return final_path

    has_ffmpeg = shutil.which("ffmpeg") is not None

    if has_ffmpeg:
        print(f"\n[VIDEO] Re-encoding with ffmpeg for clean output ...")
        try:
            subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-i", temp_path,
                    "-c:v", "libx264",
                    "-preset", "fast",
                    "-crf", "20",
                    "-pix_fmt", "yuv420p",
                    "-movflags", "+faststart",
                    final_path,
                ],
                capture_output=True,
                check=True,
            )
            # Remove temp if it's different from final
            if temp_path != final_path and os.path.isfile(temp_path):
                os.remove(temp_path)
            print(f"[VIDEO] Clean output saved: {final_path}")
            return final_path
        except subprocess.CalledProcessError as e:
            print(f"[WARN] ffmpeg re-encode failed: {e.stderr.decode()[:200]}")

    # ffmpeg not available or failed — just rename/keep the temp
    if temp_path != final_path:
        # Rename temp to final (might have wrong extension but still playable)
        actual_final = final_path.rsplit(".", 1)[0] + os.path.splitext(temp_path)[1]
        if temp_path != actual_final:
            os.rename(temp_path, actual_final)
        print(f"[VIDEO] Output saved: {actual_final}")
        print(f"[TIP]  Install ffmpeg for better quality: brew install ffmpeg")
        return actual_final
    return temp_path


# ──────────────────────────────────────────────────────────────────────────────
# 3. Colour helpers
# ──────────────────────────────────────────────────────────────────────────────
CLASS_COLOURS = [
    (0, 255, 0), (255, 165, 0), (0, 255, 255), (255, 0, 255),
    (255, 255, 0), (0, 165, 255), (128, 0, 255), (0, 255, 128),
]


def colour_for_class(class_idx: int) -> tuple:
    return CLASS_COLOURS[class_idx % len(CLASS_COLOURS)]


# ──────────────────────────────────────────────────────────────────────────────
# 4. Dashboard drawing
# ──────────────────────────────────────────────────────────────────────────────
def draw_dashboard(frame, count_down, count_up, W, H):
    """Draw a real-time count dashboard in the top-left corner."""
    total_down = sum(count_down.values())
    total_up = sum(count_up.values())

    lines_needed = 4 + max(len(count_down), 1) + max(len(count_up), 1)
    panel_w = 330
    panel_h = 30 + lines_needed * 26
    panel_h = min(panel_h, H - 10)

    # Semi-transparent dark background
    overlay = frame.copy()
    cv2.rectangle(overlay, (5, 5), (panel_w, panel_h), (30, 30, 30), cv2.FILLED)
    cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)
    cv2.rectangle(frame, (5, 5), (panel_w, panel_h), (200, 200, 200), 1)

    y = 28
    font = cv2.FONT_HERSHEY_SIMPLEX

    cv2.putText(frame, "LIVE VEHICLE COUNT", (12, y), font, 0.6,
                (255, 255, 255), 2, cv2.LINE_AA)
    y += 8
    cv2.line(frame, (12, y), (panel_w - 12, y), (100, 100, 100), 1)
    y += 22

    # DOWN section
    cv2.putText(frame, f"DOWN (total: {total_down})", (12, y),
                font, 0.55, (100, 255, 100), 2, cv2.LINE_AA)
    y += 24
    if count_down:
        for cname in sorted(count_down):
            cv2.putText(frame, f"  {cname}: {count_down[cname]}", (12, y),
                        font, 0.55, (0, 255, 0), 1, cv2.LINE_AA)
            y += 22
    else:
        cv2.putText(frame, "  --", (12, y), font, 0.5, (120, 120, 120), 1, cv2.LINE_AA)
        y += 22

    y += 6
    cv2.line(frame, (12, y), (panel_w - 12, y), (100, 100, 100), 1)
    y += 18

    # UP section
    cv2.putText(frame, f"UP (total: {total_up})", (12, y),
                font, 0.55, (130, 130, 255), 2, cv2.LINE_AA)
    y += 24
    if count_up:
        for cname in sorted(count_up):
            cv2.putText(frame, f"  {cname}: {count_up[cname]}", (12, y),
                        font, 0.55, (0, 0, 255), 1, cv2.LINE_AA)
            y += 22
    else:
        cv2.putText(frame, "  --", (12, y), font, 0.5, (120, 120, 120), 1, cv2.LINE_AA)


# ──────────────────────────────────────────────────────────────────────────────
# 5. Core processing
# ──────────────────────────────────────────────────────────────────────────────
def process_video(
    input_path: str,
    output_name: str,
    model_name: str,
    red_line_ratio: float,
    blue_line_ratio: float,
    confidence: float,
    filter_classes: list[str] | None,
):
    # ── Load model ──
    print(f"[MODEL] Loading {model_name} (auto-downloads on first run) ...")
    model = YOLO(model_name)
    class_list = model.names
    print(f"[MODEL] Loaded. Classes: {list(class_list.values())}\n")

    # ── Open video ──
    if not os.path.isfile(input_path):
        print(f"[ERROR] Input file not found: {input_path}")
        sys.exit(1)

    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        print(f"[ERROR] Cannot open video: {input_path}")
        sys.exit(1)

    W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    # ── Counting lines ──
    line_y_red = int(H * red_line_ratio)
    line_y_blue = int(H * blue_line_ratio)
    if line_y_red >= line_y_blue:
        line_y_red, line_y_blue = line_y_blue, line_y_red

    # ── Output writer (smart codec selection) ──
    input_dir = os.path.dirname(os.path.abspath(input_path))
    final_output_path = os.path.join(input_dir, output_name)
    writer, temp_path, codec_used = create_video_writer(final_output_path, fps, W, H)

    print("=" * 65)
    print("  VEHICLE DETECTION, TRACKING & COUNTING")
    print("=" * 65)
    print(f"  Input      : {input_path}")
    print(f"  Output     : {final_output_path}")
    print(f"  Resolution : {W}x{H} @ {fps:.1f} FPS | {total_frames} frames")
    print(f"  Red line   : y={line_y_red} ({red_line_ratio:.0%})")
    print(f"  Blue line  : y={line_y_blue} ({blue_line_ratio:.0%})")
    if filter_classes:
        print(f"  Filter     : {filter_classes}")
    print("=" * 65 + "\n")

    # ── Tracking state ──
    prev_cy: dict[int, int] = {}
    id_class: dict[int, str] = {}
    counted_down: set[int] = set()
    counted_up: set[int] = set()
    count_down: dict[str, int] = defaultdict(int)
    count_up: dict[str, int] = defaultdict(int)

    frame_idx = 0
    start_time = time.time()

    # ── Frame loop ──
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        frame_idx += 1

        # Run YOLO tracking
        results = model.track(frame, persist=True, conf=confidence, verbose=False)

        # ── Draw counting lines (always) ──
        cv2.line(frame, (0, line_y_red), (W, line_y_red), (0, 0, 255), 3)
        cv2.line(frame, (0, line_y_blue), (W, line_y_blue), (255, 0, 0), 3)
        cv2.putText(frame, "Red Line", (W - 120, line_y_red - 8),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2, cv2.LINE_AA)
        cv2.putText(frame, "Blue Line", (W - 130, line_y_blue - 8),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 0, 0), 2, cv2.LINE_AA)

        # ── Process detections ──
        det = results[0].boxes
        has_tracks = (
            det is not None
            and det.data is not None
            and det.id is not None
            and len(det) > 0
        )

        if has_tracks:
            boxes = det.xyxy.cpu()
            track_ids = det.id.int().cpu().tolist()
            class_indices = det.cls.int().cpu().tolist()
            confs = det.conf.cpu().tolist()

            for box, tid, cidx, cf in zip(boxes, track_ids, class_indices, confs):
                x1, y1, x2, y2 = map(int, box)
                cx = (x1 + x2) // 2
                cy = (y1 + y2) // 2
                cname = class_list[cidx]

                if filter_classes and cname.lower() not in filter_classes:
                    continue

                id_class[tid] = cname
                col = colour_for_class(cidx)

                # ── Draw box + label ──
                cv2.rectangle(frame, (x1, y1), (x2, y2), col, 2)
                cv2.circle(frame, (cx, cy), 5, (0, 0, 255), -1)
                lbl = f"ID:{tid} {cname} {cf:.0%}"
                (tw, th), _ = cv2.getTextSize(lbl, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
                cv2.rectangle(frame, (x1, y1 - th - 8), (x1 + tw + 4, y1), col, cv2.FILLED)
                cv2.putText(frame, lbl, (x1 + 2, y1 - 5),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)

                # ── Line-crossing detection ──
                if tid in prev_cy:
                    old_y = prev_cy[tid]

                    # Crossed BLUE line going DOWN
                    if old_y < line_y_blue and cy >= line_y_blue:
                        if tid not in counted_down:
                            counted_down.add(tid)
                            count_down[cname] += 1

                    # Crossed RED line going UP
                    if old_y > line_y_red and cy <= line_y_red:
                        if tid not in counted_up:
                            counted_up.add(tid)
                            count_up[cname] += 1

                prev_cy[tid] = cy

        # ── Dashboard ──
        draw_dashboard(frame, count_down, count_up, W, H)

        writer.write(frame)

        # ── Progress ──
        if frame_idx % 30 == 0 or frame_idx == total_frames:
            elapsed = time.time() - start_time
            fps_a = frame_idx / elapsed if elapsed > 0 else 0
            pct = frame_idx / max(total_frames, 1) * 100
            filled = int(30 * frame_idx / max(total_frames, 1))
            bar = "█" * filled + "░" * (30 - filled)
            print(f"  [{bar}] {pct:5.1f}%  fr {frame_idx}/{total_frames}  {fps_a:.1f}fps  ", end="\r")

    cap.release()
    writer.release()

    # ── Re-encode for clean playback ──
    actual_output = finalise_video(temp_path, final_output_path, codec_used)

    elapsed = time.time() - start_time
    _print_summary(frame_idx, elapsed, count_down, count_up, actual_output)


# ──────────────────────────────────────────────────────────────────────────────
# 6. Final terminal summary
# ──────────────────────────────────────────────────────────────────────────────
def _print_summary(frame_idx, elapsed, count_down, count_up, output_path):
    print("\n")
    print("=" * 65)
    print("  DONE!")
    print(f"  Processed {frame_idx} frames in {elapsed:.1f}s")
    print("-" * 65)
    print("  FINAL COUNTS — DOWN:")
    if count_down:
        for cname in sorted(count_down):
            print(f"    {cname:20s}: {count_down[cname]}")
        print(f"    {'TOTAL':20s}: {sum(count_down.values())}")
    else:
        print("    (none)")
    print("\n  FINAL COUNTS — UP:")
    if count_up:
        for cname in sorted(count_up):
            print(f"    {cname:20s}: {count_up[cname]}")
        print(f"    {'TOTAL':20s}: {sum(count_up.values())}")
    else:
        print("    (none)")
    print("-" * 65)
    print(f"  Output saved to: {output_path}")
    print("=" * 65 + "\n")


# ──────────────────────────────────────────────────────────────────────────────
# 7. CLI
# ──────────────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="Class-wise Vehicle Detection, Tracking & Counting",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 vehicle_tracker.py input.mp4
  python3 vehicle_tracker.py input.mp4 --classes car truck bus motorcycle
  python3 vehicle_tracker.py input.mp4 --red-line 0.35 --blue-line 0.55
  python3 vehicle_tracker.py input.mp4 --model yolo11s.pt --confidence 0.4
        """,
    )
    parser.add_argument("input", help="Path to input .mp4 video file")
    parser.add_argument("--output", default="vehicle detection tracking counting.mp4")
    parser.add_argument("--model", default="yolo11n.pt")
    parser.add_argument("--red-line", type=float, default=0.40)
    parser.add_argument("--blue-line", type=float, default=0.55)
    parser.add_argument("--confidence", type=float, default=0.30)
    parser.add_argument("--classes", nargs="+", default=None,
                        help="Filter classes, e.g. --classes car truck bus")

    args = parser.parse_args()

    if not os.path.isfile(args.input):
        print(f"[ERROR] Input file not found: {args.input}")
        sys.exit(1)

    process_video(
        input_path=args.input,
        output_name=args.output,
        model_name=args.model,
        red_line_ratio=args.red_line,
        blue_line_ratio=args.blue_line,
        confidence=args.confidence,
        filter_classes=[c.lower() for c in args.classes] if args.classes else None,
    )


if __name__ == "__main__":
    main()
