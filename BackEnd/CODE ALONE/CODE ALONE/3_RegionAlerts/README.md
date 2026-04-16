# Region-Based Security Alert System 🚨

A real-time security alarm that uses **YOLO object detection** to monitor a specific zone in a video feed. When people are detected inside the defined region, it sends an **email alert** with a snapshot.

## Features

- 🎯 **Region-based detection** — Only triggers on objects inside a defined polygon zone
- 📧 **Email alerts** — Sends a snapshot via Gmail when people enter the zone
- 🎥 **Video output** — Saves annotated video with bounding boxes and zone overlay
- ⬇️ **Auto-download** — Demo video and YOLO model are downloaded automatically on first run

## Quick Start

### 1. Clone the project

```bash
git clone <your-repo-url>
cd Vision
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Run

```bash
python3 alert.py
```

That's it! The demo video and YOLO model download automatically on first run.

## Configuration

All settings are at the top of `alert.py`:

| Setting            | Description                                  | Default                     |
|--------------------|----------------------------------------------|-----------------------------|
| `VIDEO_SOURCE`     | Path to video file, or `0` for webcam        | `solutions-ci-demo.mp4`    |
| `FROM_EMAIL`       | Gmail sender address                         | *(set yours)*               |
| `PASSWORD`         | Gmail App Password (not your main password!) | *(set yours)*               |
| `TO_EMAIL`         | Recipient email address                      | *(set yours)*               |
| `ALERT_THRESHOLD`  | Min people in zone to trigger alert          | `1`                         |
| `MODEL`            | YOLO model (auto-downloaded)                 | `yolo26n.pt`               |
| `REGION`           | Zone polygon coordinates `[(x,y), ...]`      | Lower half of 640×360 frame |

### Setting up Gmail App Password

1. Go to [Google App Passwords](https://myaccount.google.com/apppasswords)
2. Generate a new app password
3. Paste the 16-character password into `PASSWORD` in `alert.py`

### Changing the watch zone

Edit the `REGION` variable with your desired polygon coordinates:

```python
# Rectangle
REGION = [(20, 150), (620, 150), (620, 350), (20, 350)]

# Triangle
REGION = [(320, 100), (100, 350), (540, 350)]

# Any polygon
REGION = [(100, 100), (500, 100), (600, 300), (300, 350), (50, 300)]
```

## Requirements

- Python 3.9+
- Webcam or video file
- Gmail account with App Password enabled
