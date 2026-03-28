import cv2
import time
import threading
import numpy as np
from ultralytics import YOLO

# Camera source configuration (phone URLs / RTSP URLs)
CAMERA_COUNT = 3
CAMERA_SOURCES = [
    "http://10.10.1.8:8080/video",
    "http://10.10.1.9:8080/video",
    "http://10.10.1.10:8080/video",
]

# Framing behavior
SLOT_SECONDS = 1.0
TILE_WIDTH = 480
TILE_HEIGHT = 270
WINDOW_NAME = "EcoEYE Framed Multi-Cam Occupancy"

# Occupancy behavior (same concept as ecoeye_test4)
DECISION_INTERVAL_SEC = 1.0
CONFIDENCE_THRESHOLD = 0.4
MODEL_PATH = "yolo26n.pt"


class CameraReader:
    def __init__(self, src, name="cam"):
        self.src = src
        self.name = name
        self.cap = None
        self.latest = None
        self.lock = threading.Lock()
        self.running = False
        self.thread = None
        self.connected = False

    def _open_capture(self):
        cap = cv2.VideoCapture(self.src)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        if not cap.isOpened():
            cap.release()
            return None
        return cap

    def start(self):
        self.running = True
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()

    def _loop(self):
        while self.running:
            if self.cap is None:
                self.cap = self._open_capture()
                self.connected = self.cap is not None
                if self.cap is None:
                    time.sleep(1.0)
                    continue

            ok, frame = self.cap.read()
            if not ok:
                self.connected = False
                self.cap.release()
                self.cap = None
                time.sleep(0.5)
                continue

            self.connected = True
            with self.lock:
                self.latest = frame

    def get_latest(self):
        with self.lock:
            return None if self.latest is None else self.latest.copy()

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join(timeout=1.0)
        if self.cap is not None:
            self.cap.release()


def build_canvas_layout(num_cams, tile_w=640, tile_h=360):
    cols = int(np.ceil(np.sqrt(num_cams)))
    rows = int(np.ceil(num_cams / cols))
    canvas_w = cols * tile_w
    canvas_h = rows * tile_h
    positions = []
    for i in range(num_cams):
        r = i // cols
        c = i % cols
        x0, y0 = c * tile_w, r * tile_h
        positions.append((x0, y0, tile_w, tile_h))
    return canvas_w, canvas_h, positions


def draw_tile_status(canvas, cam, pos, is_active):
    x0, y0, w, h = pos
    label = cam.name.upper()
    state = "LIVE" if cam.connected else "OFFLINE"
    color = (0, 200, 0) if cam.connected else (0, 0, 255)

    cv2.rectangle(canvas, (x0, y0), (x0 + w - 1, y0 + h - 1), (50, 50, 50), 1)
    cv2.putText(canvas, f"{label}: {state}", (x0 + 10, y0 + 24),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

    if is_active:
        cv2.putText(canvas, "ACTIVE SLOT", (x0 + 10, y0 + 50),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 2)


def on_divider_change(value):
    # Trackbar callback; value is read in the main loop.
    _ = value


def zone_from_local_point(local_x, local_y, div_x, div_y):
    if local_x < div_x and local_y < div_y:
        return "top_left"
    if local_x >= div_x and local_y < div_y:
        return "top_right"
    if local_x < div_x and local_y >= div_y:
        return "bottom_left"
    return "bottom_right"


def draw_start_button(frame, started_playback, start_button):
    if started_playback:
        return

    bx1, by1, bx2, by2 = start_button
    cv2.rectangle(frame, (bx1, by1), (bx2, by2), (0, 200, 0), -1)
    cv2.rectangle(frame, (bx1, by1), (bx2, by2), (255, 255, 255), 2)
    cv2.putText(frame, "START", (bx1 + 45, by1 + 42),
                cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)
    cv2.putText(frame, "Click START to begin YOLO inference", (20, 110),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)


def run_stream_processor(state_callback, stop_event=None, start_inference=True, sleep_sec=0.02):
    """
    Headless processing loop for backend streaming.

    This reuses the same framing and occupancy logic as the desktop window mode,
    but publishes each rendered frame and zone state through a callback.
    """
    if CAMERA_COUNT <= 0:
        raise ValueError("CAMERA_COUNT must be > 0")
    if len(CAMERA_SOURCES) < CAMERA_COUNT:
        raise ValueError(
            f"Not enough camera URLs. Needed {CAMERA_COUNT}, found {len(CAMERA_SOURCES)}"
        )
    if SLOT_SECONDS <= 0:
        raise ValueError("SLOT_SECONDS must be > 0")

    selected_sources = CAMERA_SOURCES[:CAMERA_COUNT]
    cams = [CameraReader(src, f"cam{i+1}") for i, src in enumerate(selected_sources)]
    model = YOLO(MODEL_PATH)

    for cam in cams:
        cam.start()

    n = len(cams)
    canvas_w, canvas_h, positions = build_canvas_layout(n, TILE_WIDTH, TILE_HEIGHT)
    canvas = np.zeros((canvas_h, canvas_w, 3), dtype=np.uint8)

    started_playback = bool(start_inference)
    last_decision_time = time.time()
    zone_keys = ["top_left", "top_right", "bottom_left", "bottom_right"]
    last_seen_time = {
        tile_idx: {key: 0.0 for key in zone_keys}
        for tile_idx in range(n)
    }
    pending_detection = {
        tile_idx: {key: False for key in zone_keys}
        for tile_idx in range(n)
    }
    zone_occupied = {
        tile_idx: {key: False for key in zone_keys}
        for tile_idx in range(n)
    }

    cycle_start = time.monotonic()

    try:
        while True:
            if stop_event is not None and stop_event.is_set():
                break

            now = time.monotonic()
            slot = int(((now - cycle_start) / SLOT_SECONDS) % n)

            frame = cams[slot].get_latest()
            if frame is not None:
                x0, y0, w, h = positions[slot]
                resized = cv2.resize(frame, (w, h), interpolation=cv2.INTER_AREA)
                canvas[y0:y0 + h, x0:x0 + w] = resized

            frame_for_model = canvas.copy()
            display = canvas.copy()

            # In headless mode dividers default to midpoints for each tile.
            dividers = {
                idx: (max(1, TILE_WIDTH // 2), max(1, TILE_HEIGHT // 2))
                for idx in range(n)
            }

            if started_playback:
                results = model.predict(
                    frame_for_model,
                    classes=[0],
                    conf=CONFIDENCE_THRESHOLD,
                    stream=True,
                    verbose=False,
                )

                for r in results:
                    for box in r.boxes:
                        x1, y1, x2, y2 = box.xyxy[0]
                        cx, cy = int((x1 + x2) / 2), int(y2)
                        cv2.circle(display, (cx, cy), 5, (255, 255, 255), -1)

                        for tile_idx, pos in enumerate(positions):
                            x0, y0, w, h = pos
                            if x0 < cx < (x0 + w) and y0 < cy < (y0 + h):
                                local_x = cx - x0
                                local_y = cy - y0
                                div_x, div_y = dividers[tile_idx]
                                zone_key = zone_from_local_point(local_x, local_y, div_x, div_y)
                                pending_detection[tile_idx][zone_key] = True
                                break

                wall_time_now = time.time()
                if wall_time_now - last_decision_time >= DECISION_INTERVAL_SEC:
                    for tile_idx in range(n):
                        for key in zone_keys:
                            if pending_detection[tile_idx][key]:
                                zone_occupied[tile_idx][key] = True
                                last_seen_time[tile_idx][key] = wall_time_now
                            elif wall_time_now - last_seen_time[tile_idx][key] >= DECISION_INTERVAL_SEC:
                                zone_occupied[tile_idx][key] = False
                            pending_detection[tile_idx][key] = False

                    last_decision_time = wall_time_now

            for idx, cam in enumerate(cams):
                draw_tile_status(display, cam, positions[idx], is_active=(idx == slot))

            cv2.putText(display, f"Updated this slot: CAM {slot+1}",
                        (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
            cv2.putText(display, f"Total cameras: {n}",
                        (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

            for idx, pos in enumerate(positions):
                x0, y0, w, h = pos
                div_x, div_y = dividers[idx]
                gx = x0 + div_x
                gy = y0 + div_y

                cv2.line(display, (gx, y0), (gx, y0 + h), (255, 255, 255), 2)
                cv2.line(display, (x0, gy), (x0 + w, gy), (255, 255, 255), 2)

                zone_rects = {
                    "top_left": (x0, y0, gx, gy),
                    "top_right": (gx, y0, x0 + w, gy),
                    "bottom_left": (x0, gy, gx, y0 + h),
                    "bottom_right": (gx, gy, x0 + w, y0 + h),
                }

                for key, (zx1, zy1, zx2, zy2) in zone_rects.items():
                    occ = zone_occupied[idx][key]
                    color = (0, 255, 0) if occ else (0, 0, 255)
                    cv2.rectangle(display, (zx1, zy1), (zx2, zy2), color, 1)

                labels = [
                    ("TL", zone_occupied[idx]["top_left"]),
                    ("TR", zone_occupied[idx]["top_right"]),
                    ("BL", zone_occupied[idx]["bottom_left"]),
                    ("BR", zone_occupied[idx]["bottom_right"]),
                ]
                text_y = y0 + 24
                for short_key, occ in labels:
                    text = f"{short_key}: {'ON' if occ else 'OFF'}"
                    text_color = (0, 255, 0) if occ else (0, 0, 255)
                    cv2.putText(display, text, (x0 + 10, text_y),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, text_color, 1)
                    text_y += 18

            cam_zone_status = {
                f"cam{idx+1}": dict(zone_occupied[idx])
                for idx in range(n)
            }
            cam_status = {
                f"cam{idx+1}": {
                    "connected": bool(cams[idx].connected),
                }
                for idx in range(n)
            }

            state_callback(display, cam_zone_status, cam_status)
            time.sleep(max(0.0, float(sleep_sec)))

    finally:
        for cam in cams:
            cam.stop()


def main():
    if CAMERA_COUNT <= 0:
        raise ValueError("CAMERA_COUNT must be > 0")
    if len(CAMERA_SOURCES) < CAMERA_COUNT:
        raise ValueError(
            f"Not enough camera URLs. Needed {CAMERA_COUNT}, found {len(CAMERA_SOURCES)}"
        )
    if SLOT_SECONDS <= 0:
        raise ValueError("SLOT_SECONDS must be > 0")

    selected_sources = CAMERA_SOURCES[:CAMERA_COUNT]
    cams = [CameraReader(src, f"cam{i+1}") for i, src in enumerate(selected_sources)]

    model = YOLO(MODEL_PATH)

    for cam in cams:
        cam.start()

    n = len(cams)
    canvas_w, canvas_h, positions = build_canvas_layout(n, TILE_WIDTH, TILE_HEIGHT)
    canvas = np.zeros((canvas_h, canvas_w, 3), dtype=np.uint8)

    started_playback = False
    start_button = (20, 20, 200, 80)

    last_decision_time = time.time()
    zone_keys = ["top_left", "top_right", "bottom_left", "bottom_right"]
    last_seen_time = {
        tile_idx: {key: 0.0 for key in zone_keys}
        for tile_idx in range(n)
    }
    pending_detection = {
        tile_idx: {key: False for key in zone_keys}
        for tile_idx in range(n)
    }
    zone_occupied = {
        tile_idx: {key: False for key in zone_keys}
        for tile_idx in range(n)
    }

    def on_mouse_click(event, x, y, flags, param):
        nonlocal started_playback
        _ = (flags, param)
        if event == cv2.EVENT_LBUTTONDOWN and not started_playback:
            bx1, by1, bx2, by2 = start_button
            if bx1 <= x <= bx2 and by1 <= y <= by2:
                started_playback = True

    cv2.namedWindow(WINDOW_NAME)
    cv2.setMouseCallback(WINDOW_NAME, on_mouse_click)
    for tile_idx in range(n):
        cv2.createTrackbar(
            f"Cam{tile_idx+1} Div X",
            WINDOW_NAME,
            TILE_WIDTH // 2,
            max(1, TILE_WIDTH - 1),
            on_divider_change,
        )
        cv2.createTrackbar(
            f"Cam{tile_idx+1} Div Y",
            WINDOW_NAME,
            TILE_HEIGHT // 2,
            max(1, TILE_HEIGHT - 1),
            on_divider_change,
        )

    cycle_start = time.monotonic()

    try:
        while True:
            now = time.monotonic()
            slot = int(((now - cycle_start) / SLOT_SECONDS) % n)

            frame = cams[slot].get_latest()
            if frame is not None:
                x0, y0, w, h = positions[slot]
                resized = cv2.resize(frame, (w, h), interpolation=cv2.INTER_AREA)
                canvas[y0:y0 + h, x0:x0 + w] = resized

            frame_for_model = canvas.copy()
            display = canvas.copy()

            dividers = {}
            for idx in range(n):
                div_x = cv2.getTrackbarPos(f"Cam{idx+1} Div X", WINDOW_NAME)
                div_y = cv2.getTrackbarPos(f"Cam{idx+1} Div Y", WINDOW_NAME)
                dividers[idx] = (
                    max(1, min(TILE_WIDTH - 1, div_x)),
                    max(1, min(TILE_HEIGHT - 1, div_y)),
                )

            if started_playback:
                results = model.predict(
                    frame_for_model,
                    classes=[0],
                    conf=CONFIDENCE_THRESHOLD,
                    stream=True,
                    verbose=False,
                )

                for r in results:
                    for box in r.boxes:
                        x1, y1, x2, y2 = box.xyxy[0]
                        cx, cy = int((x1 + x2) / 2), int(y2)
                        cv2.circle(display, (cx, cy), 5, (255, 255, 255), -1)

                        for tile_idx, pos in enumerate(positions):
                            x0, y0, w, h = pos
                            if x0 < cx < (x0 + w) and y0 < cy < (y0 + h):
                                local_x = cx - x0
                                local_y = cy - y0
                                div_x, div_y = dividers[tile_idx]
                                zone_key = zone_from_local_point(local_x, local_y, div_x, div_y)
                                pending_detection[tile_idx][zone_key] = True
                                break

                wall_time_now = time.time()
                if wall_time_now - last_decision_time >= DECISION_INTERVAL_SEC:
                    for tile_idx in range(n):
                        for key in zone_keys:
                            if pending_detection[tile_idx][key]:
                                zone_occupied[tile_idx][key] = True
                                last_seen_time[tile_idx][key] = wall_time_now
                            elif wall_time_now - last_seen_time[tile_idx][key] >= DECISION_INTERVAL_SEC:
                                zone_occupied[tile_idx][key] = False
                            pending_detection[tile_idx][key] = False

                    last_decision_time = wall_time_now

            for idx, cam in enumerate(cams):
                draw_tile_status(display, cam, positions[idx], is_active=(idx == slot))

            cv2.putText(display, f"Updated this slot: CAM {slot+1}",
                        (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
            cv2.putText(display, f"Total cameras: {n}",
                        (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

            for idx, pos in enumerate(positions):
                x0, y0, w, h = pos
                div_x, div_y = dividers[idx]
                gx = x0 + div_x
                gy = y0 + div_y

                # Per-tile X and Y dividers.
                cv2.line(display, (gx, y0), (gx, y0 + h), (255, 255, 255), 2)
                cv2.line(display, (x0, gy), (x0 + w, gy), (255, 255, 255), 2)

                # Draw 4 per-tile zone boundaries with occupancy colors.
                zone_rects = {
                    "top_left": (x0, y0, gx, gy),
                    "top_right": (gx, y0, x0 + w, gy),
                    "bottom_left": (x0, gy, gx, y0 + h),
                    "bottom_right": (gx, gy, x0 + w, y0 + h),
                }

                for key, (zx1, zy1, zx2, zy2) in zone_rects.items():
                    occ = zone_occupied[idx][key]
                    color = (0, 255, 0) if occ else (0, 0, 255)
                    cv2.rectangle(display, (zx1, zy1), (zx2, zy2), color, 1)

                # Compact per-tile status labels.
                labels = [
                    ("TL", zone_occupied[idx]["top_left"]),
                    ("TR", zone_occupied[idx]["top_right"]),
                    ("BL", zone_occupied[idx]["bottom_left"]),
                    ("BR", zone_occupied[idx]["bottom_right"]),
                ]
                text_y = y0 + 24
                for short_key, occ in labels:
                    text = f"{short_key}: {'ON' if occ else 'OFF'}"
                    text_color = (0, 255, 0) if occ else (0, 0, 255)
                    cv2.putText(display, text, (x0 + 10, text_y),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, text_color, 1)
                    text_y += 18

            draw_start_button(display, started_playback, start_button)

            cv2.imshow(WINDOW_NAME, display)

            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break

            time.sleep(0.02)

    finally:
        for cam in cams:
            cam.stop()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
