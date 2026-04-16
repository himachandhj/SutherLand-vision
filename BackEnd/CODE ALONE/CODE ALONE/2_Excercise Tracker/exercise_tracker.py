"""
Exercise Tracker using Ultralytics YOLO Pose Estimation
Monitors workouts (Push-ups, Squats, Leg Press, Leg Extension) and counts reps.
"""

import cv2
from ultralytics import solutions
from ultralytics.utils.downloads import safe_download


def download_videos():
    """Download exercise demo videos from GitHub."""
    exercises_list = ["Legextension", "Legpress", "Squats", "Pushups"]
    for exercise in exercises_list:
        safe_download(
            f"https://github.com/ultralytics/assets/releases/download/v0.0.0/{exercise}.demo.video.mp4"
        )
    return exercises_list


def process_exercise(video_path, output_path, kpts, model="yolo26n-pose.pt", up_angle=145.0, down_angle=90.0):
    """
    Process a single exercise video and save the output.

    Args:
        video_path: Path to the input video file.
        output_path: Path for the output video file.
        kpts: List of 3 keypoint indices for monitoring the exercise.
        model: Path to the YOLO pose estimation model.
        up_angle: Angle threshold for the 'up' pose.
        down_angle: Angle threshold for the 'down' pose.
    """
    cap = cv2.VideoCapture(video_path)
    assert cap.isOpened(), f"Error reading video file: {video_path}"

    # Video writer
    w, h, fps = (int(cap.get(x)) for x in (cv2.CAP_PROP_FRAME_WIDTH, cv2.CAP_PROP_FRAME_HEIGHT, cv2.CAP_PROP_FPS))
    video_writer = cv2.VideoWriter(output_path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))

    # Init AIGym
    gym = solutions.AIGym(
        show=False,  # Don't display the frame (running headless)
        kpts=kpts,
        model=model,
        line_width=4,
        up_angle=up_angle,
        down_angle=down_angle,
        verbose=False,
    )

    # Process video
    frame_count = 0
    while cap.isOpened():
        success, im0 = cap.read()
        if not success:
            break
        results = gym(im0)
        video_writer.write(results.plot_im)
        frame_count += 1

    cap.release()
    video_writer.release()
    print(f"  Processed {frame_count} frames -> {output_path}")


def convert_avi_to_mp4(avi_path, mp4_path):
    """Convert an AVI file to MP4 using OpenCV."""
    cap = cv2.VideoCapture(avi_path)
    if not cap.isOpened():
        print(f"  Warning: Could not open {avi_path} for conversion")
        return

    w, h, fps = (int(cap.get(x)) for x in (cv2.CAP_PROP_FRAME_WIDTH, cv2.CAP_PROP_FRAME_HEIGHT, cv2.CAP_PROP_FPS))
    video_writer = cv2.VideoWriter(mp4_path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))

    while cap.isOpened():
        success, frame = cap.read()
        if not success:
            break
        video_writer.write(frame)

    cap.release()
    video_writer.release()
    print(f"  Converted -> {mp4_path}")


def main():
    # Step 1: Download videos
    print("=" * 60)
    print("Downloading exercise demo videos...")
    print("=" * 60)
    download_videos()

    # Step 2: Define exercises with their configurations
    exercises = [
        {
            "name": "Pushups",
            "video": "Pushups.demo.video.mp4",
            "kpts": [5, 7, 9],
            "model": "yolo26n-pose.pt",
            "up_angle": 145.0,
            "down_angle": 90.0,
        },
        {
            "name": "Squats",
            "video": "Squats.demo.video.mp4",
            "kpts": [5, 11, 13],
            "model": "yolo26m-pose.pt",
            "up_angle": 145.0,
            "down_angle": 90.0,
        },
        {
            "name": "Legpress",
            "video": "Legpress.demo.video.mp4",
            "kpts": [11, 13, 15],
            "model": "yolo26x-pose.pt",
            "up_angle": 140.0,
            "down_angle": 120.0,
        },
        {
            "name": "Legextension",
            "video": "Legextension.demo.video.mp4",
            "kpts": [12, 14, 16],
            "model": "yolo26m-pose.pt",
            "up_angle": 145.0,
            "down_angle": 90.0,
        },
    ]

    # Step 3: Process each exercise
    for exercise in exercises:
        print(f"\n{'=' * 60}")
        print(f"Processing: {exercise['name']}")
        print(f"{'=' * 60}")

        avi_output = f"{exercise['name']}.output.avi"
        mp4_output = f"{exercise['name']}.output.mp4"

        # Process with YOLO
        process_exercise(
            video_path=exercise["video"],
            output_path=avi_output,
            kpts=exercise["kpts"],
            model=exercise["model"],
            up_angle=exercise["up_angle"],
            down_angle=exercise["down_angle"],
        )

        # Convert AVI output to MP4
        print(f"  Converting to MP4...")
        convert_avi_to_mp4(avi_output, mp4_output)

    print(f"\n{'=' * 60}")
    print("All exercises processed successfully!")
    print("Output files:")
    for exercise in exercises:
        print(f"  - {exercise['name']}.output.mp4")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
