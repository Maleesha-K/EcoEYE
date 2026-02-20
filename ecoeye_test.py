import cv2
from ultralytics import YOLO

# 1. Load the YOLO26n model
model = YOLO("yolo26n.pt") 

# 2. Open webcam
cap = cv2.VideoCapture(0)

while cap.isOpened():
    success, frame = cap.read()
    if not success:
        print("Ignoring empty camera frame.")
        break

    # 3. Define a 'Zone' (Lounge Area) 
    # Coordinates: [y1:y2, x1:x2] - Adjust these numbers to change the box size
    height, width, _ = frame.shape
    zone_x1, zone_y1 = int(width * 0.5), 0      # Right half of the screen
    zone_x2, zone_y2 = width, height
    
    # Draw the Zone on the frame for visualization
    cv2.rectangle(frame, (zone_x1, zone_y1), (zone_x2, zone_y2), (255, 0, 0), 2)
    cv2.putText(frame, "LOUNGE ZONE", (zone_x1 + 10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 0, 0), 2)

    # 4. Run YOLO26n detection
    results = model.predict(frame, classes=[0], conf=0.4, stream=True, verbose=False)

    lounge_occupied = False

    for r in results:
        for box in r.boxes:
            # Get bounding box coordinates
            x1, y1, x2, y2 = box.xyxy[0]
            
            # Calculate the 'Base-Point' (Bottom Center of the person)
            cx = int((x1 + x2) / 2)
            cy = int(y2)

            # Draw a small dot at the base point
            cv2.circle(frame, (cx, cy), 5, (0, 255, 0), -1)

            # 5. Check if the person's base-point is inside the Lounge Zone
            if zone_x1 < cx < zone_x2 and zone_y1 < cy < zone_y2:
                lounge_occupied = True

    # 6. Output for Energy Optimization
    if lounge_occupied:
        cv2.putText(frame, "STATUS: LIGHTS ON", (50, height - 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 3)
    else:
        cv2.putText(frame, "STATUS: ENERGY SAVING", (50, height - 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 3)

    cv2.imshow("EcoEYE Zoning Prototype", frame)

    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()