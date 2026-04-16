# Simple Person Counter 🔢

Detects and counts people in a video using YOLO. Shows clean bounding boxes and a live person count on screen — no regions, no IDs, no probabilities.

## Quick Start

```bash
cd ObjectCounting
pip install -r requirements.txt
python3 count.py
```

Press **Q** to stop early. Output saves to `person_count_output.mp4`.

## Configuration

All settings are at the top of `count.py`:

| Setting        | Description                            | Default                  |
|----------------|----------------------------------------|--------------------------|
| `VIDEO_SOURCE` | Path to video file, or `0` for webcam | `solutions-ci-demo.mp4` |
| `MODEL`        | YOLO model (auto-downloaded)          | `yolo26n.pt`            |
| `CONFIDENCE`   | Detection confidence threshold        | `0.35`                  |
| `OUTPUT_FILE`  | Output video path                     | `person_count_output.mp4` |

## Requirements

- Python 3.9+
- Webcam or video file
