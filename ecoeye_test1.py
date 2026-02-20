import cv2
from ultralytics import YOLO

# 1. Load the YOLO26n model
model = YOLO("yolo26n.pt") 

# 2. Open webcam
cap = cv2.VideoCapture(0)

while cap.isOpened():
    success, frame = cap.read()
    if not success:
        break

    h, w, _ = frame.shape
    mid_x, mid_y = w // 2, h // 2

    # 3. Define 4 Zones: [name, (x1, y1, x2, y2), color]
    zones = [
        {"name": "Zone A (Top-L)", "area": (0, 0, mid_x, mid_y), "color": (255, 0, 0), "occupied": False},
        {"name": "Zone B (Top-R)", "area": (mid_x, 0, w, mid_y), "color": (0, 255, 0), "occupied": False},
        {"name": "Zone C (Bot-L)", "area": (0, mid_y, mid_x, h), "color": (0, 0, 255), "occupied": False},
        {"name": "Zone D (Bot-R)", "area": (mid_x, mid_y, w, h), "color": (0, 255, 255), "occupied": False},
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

    # 5. Draw Zones and Display Light Status
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

    cv2.imshow("EcoEYE Multi-Zone Occupancy", frame)

    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()