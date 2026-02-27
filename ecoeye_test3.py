import cv2
import time
import os
import requests
from ultralytics import YOLO

# ─────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────
CAMERA_URL = "http://10.10.20.226:8080/video"   # <-- Change to your IPWebcam URL
# Alternatives:
# CAMERA_URL = "http://10.10.20.226:8080/mjpegfeed"
# CAMERA_URL = "http://10.10.20.226:8080/videofeed"

MODEL_PATH  = "yolo26n.pt"
CONFIDENCE  = 0.4

# ESP32 WiFi Configuration
ESP32_IP = "192.168.1.XXX"  # <--- Change to the IP shown in Thonny

# Set SHOW_DISPLAY = True only if a monitor is connected to the Pi.
# If running headless (SSH / no screen), keep it False.
SHOW_DISPLAY = False

# ─────────────────────────────────────────────
# LOAD MODEL
# ─────────────────────────────────────────────
print("[EcoEYE] Loading YOLO model...")
model = YOLO(MODEL_PATH)
print("[EcoEYE] Model loaded successfully.")

# ─────────────────────────────────────────────
# CONNECT TO IP CAMERA
# ─────────────────────────────────────────────
def open_camera(url, retries=5, delay=3):
    for attempt in range(1, retries + 1):
        print(f"[EcoEYE] Connecting to camera (attempt {attempt}/{retries}): {url}")
        cap = cv2.VideoCapture(url)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Reduce latency
        if cap.isOpened():
            print("[EcoEYE] Camera connected successfully.")
            return cap
        print(f"[EcoEYE] Connection failed. Retrying in {delay}s...")
        time.sleep(delay)
    print("[EcoEYE] ERROR: Could not connect to camera. Check:")
    print("  1. IPWebcam app is running on your phone/device")
    print("  2. IP address and port are correct")
    print("  3. Pi and device are on the same Wi-Fi network")
    return None


def send_esp32_signal(on):
    url = f"http://{ESP32_IP}/on" if on else f"http://{ESP32_IP}/off"
    try:
        # Timeout set to 0.5s to avoid blocking detection for too long
        requests.get(url, timeout=0.5)
        print(f"[EcoEYE] Signal sent to ESP32: {'ON' if on else 'OFF'}")
    except Exception as e:
        print(f"[EcoEYE] WiFi Signal failed: {e}")


def main():
    cap = open_camera(CAMERA_URL)
    if cap is None:
        return

    print("[EcoEYE] Starting detection loop. Press Ctrl+C to stop.")

    try:
        while True:
            # Flush stale buffered frames for low-latency reads
            for _ in range(3):
                cap.grab()
            success, frame = cap.retrieve()

            if not success:
                print("[EcoEYE] Frame read failed. Attempting reconnect...")
                cap.release()
                cap = open_camera(CAMERA_URL)
                if cap is None:
                    break
                continue

            h, w, _ = frame.shape
            mid_x, mid_y = w // 2, h // 2

            # ── Define 4 Zones ──────────────────────────────
            zones = [
                {"name": "Zone A (Top-L)", "area": (0,      0,      mid_x, mid_y), "color": (255,   0,   0), "occupied": False},
                {"name": "Zone B (Top-R)", "area": (mid_x,  0,      w,     mid_y), "color": (0,   255,   0), "occupied": False},
                {"name": "Zone C (Bot-L)", "area": (0,      mid_y,  mid_x, h    ), "color": (0,     0, 255), "occupied": False},
                {"name": "Zone D (Bot-R)", "area": (mid_x,  mid_y,  w,     h    ), "color": (0,   255, 255), "occupied": False},
            ]

            # ── Run YOLO Detection (Person class = 0) ───────
            results = model.predict(frame, classes=[0], conf=CONFIDENCE, verbose=False)

            for r in results:
                for box in r.boxes:
                    x1, y1, x2, y2 = box.xyxy[0]
                    cx = int((x1 + x2) / 2)
                    cy = int(y2)  # Base-point (feet) for better zone mapping

                    if SHOW_DISPLAY:
                        cv2.circle(frame, (cx, cy), 5, (255, 255, 255), -1)

                    for zone in zones:
                        zx1, zy1, zx2, zy2 = zone["area"]
                        if zx1 < cx < zx2 and zy1 < cy < zy2:
                            zone["occupied"] = True

            # ── Terminal Output & Signaling ──────────────────
            print(f"\n--- EcoEYE [{time.strftime('%H:%M:%S')}] ---")
            any_occupied = False
            for zone in zones:
                status = "💡 LIGHTS ON " if zone["occupied"] else "🌑 LIGHTS OFF"
                print(f"  {zone['name']}: {status}")
                if zone["occupied"]:
                    any_occupied = True

            # Send signal only if occupancy state changed
            if not hasattr(main, "last_state"):
                main.last_state = None

            if any_occupied != main.last_state:
                send_esp32_signal(any_occupied)
                main.last_state = any_occupied

            # ── Optional Display (only if monitor connected) ─
            if SHOW_DISPLAY:
                for zone in zones:
                    zx1, zy1, zx2, zy2 = zone["area"]
                    status     = "LIGHTS: ON"  if zone["occupied"] else "LIGHTS: OFF"
                    text_color = (0, 255, 0)   if zone["occupied"] else (0, 0, 255)
                    cv2.rectangle(frame, (zx1, zy1), (zx2, zy2), zone["color"], 2)
                    cv2.putText(frame, zone["name"], (zx1 + 10, zy1 + 30),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.6, zone["color"], 2)
                    cv2.putText(frame, status, (zx1 + 10, zy1 + 60),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.6, text_color, 2)

                cv2.imshow("EcoEYE Multi-Zone Occupancy", frame)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break

    except KeyboardInterrupt:
        print("\n[EcoEYE] Shutting down gracefully...")
    finally:
        cap.release()
        if SHOW_DISPLAY:
            cv2.destroyAllWindows()
        print("[EcoEYE] Done.")


if __name__ == "__main__":
    main()