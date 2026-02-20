import cv2
import time
from ultralytics import YOLO

# 1. Initialization
model = YOLO("yolo26n.pt")  # Optimized for Edge CPU
SAMPLING_INTERVAL = 1       # 5-second interval to save Pi resources
CONFIDENCE_THRESHOLD = 0.4 

# Multi-Zone Configuration (Normalized 0.0 to 1.0)
ZONES = [
    {"name": "Lounge", "area": (0.0, 0.0, 0.5, 1.0)},  
    {"name": "Workstations", "area": (0.5, 0.0, 1.0, 1.0)}
]

def process_occupancy():
    cap = cv2.VideoCapture(0)
    
    # Optimization: Set internal buffer to small size if hardware supports it
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    print("EcoEYE Interval Processor Started...")

    try:
        while True:
            # --- CRITICAL STEP: FLUSH BUFFER ---
            # We read multiple times to throw away 'old' frames stored in the RAM
            for _ in range(5): 
                cap.grab() # .grab() is faster than .read() because it doesn't decode the image
            
            success, frame = cap.retrieve() # Decode only the very latest frame
            
            if not success:
                print("Stream disconnected. Retrying...")
                time.sleep(2)
                continue

            height, width, _ = frame.shape

            # Run YOLO26n (The Brain)
            results = model.predict(frame, classes=[0], conf=CONFIDENCE_THRESHOLD, verbose=False)

            active_zones = {zone["name"]: False for zone in ZONES}

            for r in results:
                for box in r.boxes:
                    # Use Bottom-Center (Feet) for better zone mapping
                    x1, y1, x2, y2 = box.xyxy[0]
                    cx, cy = (x1 + x2) / 2, y2 
                    
                    norm_x, norm_y = cx / width, cy / height

                    for zone in ZONES:
                        zx1, zy1, zx2, zy2 = zone["area"]
                        if zx1 <= norm_x <= zx2 and zy1 <= norm_y <= zy2:
                            active_zones[zone["name"]] = True

            # Action: Output status
            print(f"\n--- EcoEYE Audit [{time.strftime('%H:%M:%S')}] ---")
            for zone_name, is_occupied in active_zones.items():
                status = "💡 LIGHTS ON" if is_occupied else "🌑 POWER SAVING"
                print(f"{zone_name}: {status}")

            # Optimization: Pi sleeps here to remain cool
            time.sleep(SAMPLING_INTERVAL)

    except KeyboardInterrupt:
        print("EcoEYE shutting down...")
    finally:
        cap.release()

if __name__ == "__main__":
    process_occupancy()