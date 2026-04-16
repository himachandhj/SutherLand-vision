# Speed Estimation using YOLOv8

This repository contains a simple Python script to perform speed estimation on a video using the Ultralytics YOLOv8 library.

## Prerequisites

Make sure you have Python 3.8+ installed on your system.

## Installation

1. Clone or download this project to your local machine.
2. Navigate to the project directory:
   ```bash
   cd 5_Speed_Estimation
   ```
3. Install the required dependencies using `pip`:
   ```bash
   pip install -r requirements.txt
   ```

## Usage

1. Ensure your input video is named `Input_Speed.mp4` and is placed in the same directory as the script. (Or modify the `video_path` variable in `speed_estimation.py`).
2. Run the script:
   ```bash
   python speed_estimation.py
   ```
3. The script will process the video and generate an output file named `speed_estimation_output.mp4` in the same directory.

### Notes

- The script automatically downloads the `yolov8n.pt` (YOLOv8 Nano) model the first time you run it.
- By default, it processes all detected objects. You can modify the `solutions.SpeedEstimator` initialization in the script to track specific classes or adjust the maximum speed threshold.
