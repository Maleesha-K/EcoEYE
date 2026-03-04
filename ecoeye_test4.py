import cv2
from ultralytics import YOLO

# 1. Load the YOLO26n model
model = YOLO("yolo26n.pt") 

# 2. Local video file configuration
VIDEO_PATH = "video.mp4"
WINDOW_NAME = "EcoEYE 2-Zone Occupancy"

# 3. Open video stream from local file
cap = cv2.VideoCapture(VIDEO_PATH)

# Set buffer size to reduce latency
cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

# Check if the video opened successfully
if not cap.isOpened():
    print(f"Error: Could not open video file: {VIDEO_PATH}")
    print("Please check that video.mp4 exists in the same folder as this script.")
    exit()


def on_divider_change(value):
    pass


trackbar_initialized = False

while cap.isOpened():
    success, frame = cap.read()
    if not success:
        break

    h, w, _ = frame.shape
    if not trackbar_initialized:
        cv2.namedWindow(WINDOW_NAME)
        cv2.createTrackbar("Divider X", WINDOW_NAME, w // 2, w - 1, on_divider_change)
        trackbar_initialized = True

    divider_x = cv2.getTrackbarPos("Divider X", WINDOW_NAME)
    divider_x = max(1, min(w - 1, divider_x))

    # 3. Define 2 Zones split by one vertical line
    zones = [
        {"name": "Zone Left", "area": (0, 0, divider_x, h), "color": (255, 0, 0), "occupied": False},
        {"name": "Zone Right", "area": (divider_x, 0, w, h), "color": (0, 255, 0), "occupied": False},
    ]

    # 4. Run YOLO26n detection (Person class only)
    results = model.predict(frame, classes=[0], conf=0.4, stream=True, verbose=False)

    for r in results:
        for box in r.boxes:
            x1, y1, x2, y2 = box.xyxy[0]
            cx, cy = int((x1 + x2) / 2), int(y2) # Base-point (feet)
            cv2.circle(frame, (cx, cy), 5, (255, 255, 255), -1)

            # Check which zone the person is in
            for zone in zones:
                zx1, zy1, zx2, zy2 = zone["area"]
                if zx1 < cx < zx2 and zy1 < cy < zy2:
                    zone["occupied"] = True

    # 5. Draw one vertical divider and display zone status
    cv2.line(frame, (divider_x, 0), (divider_x, h), (255, 255, 255), 2)

    for zone in zones:
        zx1, zy1, zx2, zy2 = zone["area"]
        status = "LIGHTS: ON" if zone["occupied"] else "LIGHTS: OFF"
        text_color = (0, 255, 0) if zone["occupied"] else (0, 0, 255)
        
        # Draw zone boundary
        cv2.rectangle(frame, (zx1, zy1), (zx2, zy2), zone["color"], 2)
        
        # Display Zone Name and Status
        cv2.putText(frame, zone["name"], (zx1 + 10, zy1 + 30), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, zone["color"], 2)
        cv2.putText(frame, status, (zx1 + 10, zy1 + 60), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, text_color, 2)

    cv2.imshow(WINDOW_NAME, frame)

    key = cv2.waitKey(1) & 0xFF
    if key in (ord("a"), 81):  # 'a' or left-arrow
        divider_x = max(1, divider_x - 5)
        cv2.setTrackbarPos("Divider X", WINDOW_NAME, divider_x)
    elif key in (ord("d"), 83):  # 'd' or right-arrow
        divider_x = min(w - 1, divider_x + 5)
        cv2.setTrackbarPos("Divider X", WINDOW_NAME, divider_x)
    elif key == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()