import argparse
import cv2
import time
import threading
import numpy as np

# Inline camera configuration.
# 1) Set CAMERA_COUNT to how many sources to use.
# 2) Paste camera URLs in CAMERA_SOURCES.
# 3) The script will use the first CAMERA_COUNT URLs.
CAMERA_COUNT = 2
CAMERA_SOURCES = [
    "http://10.10.1.8:8080/video",
    "http://10.10.19.254:8080/video",
]

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
        # Keep only very fresh frames to reduce lag on low-power devices.
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


def parse_args():
    parser = argparse.ArgumentParser(
        description="Time-sliced frame joiner for multiple camera URLs"
    )
    parser.add_argument(
        "--cams",
        nargs="+",
        required=False,
        help="Camera sources. Example: --cams http://192.168.1.10:8080/video http://192.168.1.11:8080/video",
    )
    parser.add_argument(
        "--camera-count",
        type=int,
        default=None,
        help="Use only first N camera URLs (applies to --cams or inline config)",
    )
    parser.add_argument("--tile-width", type=int, default=480)
    parser.add_argument("--tile-height", type=int, default=270)
    parser.add_argument(
        "--slot-seconds",
        type=float,
        default=1.0,
        help="How long each camera stays active before switching",
    )
    return parser.parse_args()


def resolve_camera_sources(args):
    raw_sources = args.cams if args.cams else CAMERA_SOURCES
    sources = [src.strip() for src in raw_sources if src and src.strip()]

    selected_count = args.camera_count if args.camera_count is not None else CAMERA_COUNT
    if selected_count <= 0:
        raise ValueError("camera count must be > 0")

    if len(sources) < selected_count:
        raise ValueError(
            f"Not enough camera URLs. Needed {selected_count}, found {len(sources)}."
        )

    return sources[:selected_count]


def main(camera_sources, tile_w=480, tile_h=270, slot_seconds=1.0):
    if not camera_sources:
        raise ValueError("camera_sources cannot be empty")
    if slot_seconds <= 0:
        raise ValueError("slot_seconds must be > 0")

    cams = [CameraReader(src, f"cam{i+1}") for i, src in enumerate(camera_sources)]
    for c in cams:
        c.start()

    n = len(cams)
    canvas_w, canvas_h, positions = build_canvas_layout(n, tile_w=tile_w, tile_h=tile_h)
    canvas = np.zeros((canvas_h, canvas_w, 3), dtype=np.uint8)

    start = time.monotonic()

    try:
        while True:
            now = time.monotonic()
            # Example for 4 cameras with slot_seconds=1.0:
            # 0-1s cam1, 1-2s cam2, 2-3s cam3, 3-4s cam4, then repeat.
            slot = int(((now - start) / slot_seconds) % n)

            frame = cams[slot].get_latest()
            if frame is not None:
                x0, y0, w, h = positions[slot]
                resized = cv2.resize(frame, (w, h), interpolation=cv2.INTER_AREA)
                canvas[y0:y0+h, x0:x0+w] = resized

            display = canvas.copy()
            for idx, cam in enumerate(cams):
                draw_tile_status(display, cam, positions[idx], is_active=(idx == slot))

            cv2.putText(display, f"Updated this slot: CAM {slot+1}",
                        (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
            cv2.putText(display, f"Total cameras: {n}",
                        (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

            # Show composite output (for debug)
            cv2.imshow("Time-Sliced Composite", display)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

            # Run loop lightly; slot change happens every second
            time.sleep(0.02)

    finally:
        for c in cams:
            c.stop()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    args = parse_args()
    selected_sources = resolve_camera_sources(args)
    main(
        camera_sources=selected_sources,
        tile_w=args.tile_width,
        tile_h=args.tile_height,
        slot_seconds=args.slot_seconds,
    )