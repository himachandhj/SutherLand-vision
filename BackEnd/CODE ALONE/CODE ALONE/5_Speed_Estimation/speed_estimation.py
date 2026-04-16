import cv2
from ultralytics import solutions

video_path = "Input_Speed.mp4"
output_path = "speed_estimation_output.mp4"

cap = cv2.VideoCapture(video_path)
assert cap.isOpened(), "Error reading video file"

w, h, fps = (int(cap.get(x)) for x in (cv2.CAP_PROP_FRAME_WIDTH, cv2.CAP_PROP_FRAME_HEIGHT, cv2.CAP_PROP_FPS))
video_writer = cv2.VideoWriter(output_path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))

# Define region points for speed estimation (usually required by ultralytics)
# Ultralytics SpeedEstimator usually requires a region (line or polygon)
# We will use a default line across the middle if no region is provided, but let's check user's code.

speedestimator = solutions.SpeedEstimator(
    show=False,
    model="yolov8n.pt",
    # If ultralytics complains about missing region, we will add it.
)

while cap.isOpened():
    success, im0 = cap.read()
    if not success:
        print("Video frame is empty or processing is complete.")
        break
        
    results = speedestimator(im0)
    video_writer.write(results.plot_im)
        
cap.release()
video_writer.release()
cv2.destroyAllWindows()
