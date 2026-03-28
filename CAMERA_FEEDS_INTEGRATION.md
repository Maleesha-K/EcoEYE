# EcoEYE Camera Feeds Integration Guide

## Overview
The new "Camera Feeds" page in the React control app is ready to receive video streams and zone occupancy data from the Python backend. This guide explains how to modify `ecoeye_framed_yolo.py` to:

1. **Serve MJPEG video stream** - HTTP endpoint for video display
2. **Expose zone status API** - JSON endpoint for zone occupancy data
3. **Enable CORS** - Allow requests from the React app

---

## Backend Setup: Flask Integration

### Step 1: Create a Flask Backend Wrapper

Create a new file: `app.py` (if not already present) to serve the video and API endpoints.

```python
from flask import Flask, Response, jsonify
from flask_cors import CORS
import cv2
import threading
import time
from ecoeye_framed_yolo import main as run_ecoeye

app = Flask(__name__)
CORS(app)  # Enable CORS for React app

# Global variables to share state between YOLO thread and Flask
camera_frame = None
frame_lock = threading.Lock()
zone_status = {}
camera_status = {}

def generate_frames():
    """Generator function to yield MJPEG frames"""
    global camera_frame
    while True:
        with frame_lock:
            if camera_frame is None:
                continue
            success, buffer = cv2.imencode('.jpg', camera_frame)
            frame = buffer.tobytes()
        
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n'
               b'Content-Length: ' + str(len(frame)).encode() + b'\r\n\r\n' + frame + b'\r\n')
        time.sleep(0.033)  # ~30 FPS

@app.route('/video_feed')
def video_feed():
    """MJPEG video stream endpoint"""
    return Response(generate_frames(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/api/zone-status')
def get_zone_status():
    """Zone occupancy status endpoint"""
    with frame_lock:
        return jsonify({
            'cam1': zone_status.get('cam1', {}),
            'cam2': zone_status.get('cam2', {}),
            'cameraStatus': camera_status
        })

if __name__ == '__main__':
    # Start Flask in a separate thread
    app.run(host='0.0.0.0', port=5000, debug=False)
```

### Step 2: Install Required Packages

```bash
pip install flask flask-cors opencv-python
```

### Step 3: Modify `ecoeye_framed_yolo.py`

You need to modify the main loop to:
1. Share the display frame with Flask
2. Share zone occupancy data with Flask
3. Share camera status with Flask

**Key modifications:**

```python
# At the top of ecoeye_framed_yolo.py, add global variables for Flask:
import threading

# Flask integration globals
camera_frame = None
frame_lock = threading.Lock()
zone_status = {}
camera_status = {}

def update_flask_data(display, zone_occupied, cams, positions, slot):
    """Update shared data for Flask endpoints"""
    global camera_frame, zone_status, camera_status
    
    with frame_lock:
        camera_frame = display.copy()
        
        # Update zone status for each camera
        for idx, cam in enumerate(cams):
            cam_key = f"cam{idx+1}"
            zone_status[cam_key] = zone_occupied[idx]
            camera_status[cam_key] = {
                'connected': cam.connected,
                'fps': 30  # Update with actual FPS if tracking
            }

# In the main loop (after cv2.imshow), add:
update_flask_data(display, zone_occupied, cams, positions, slot)
```

---

## Integration Architecture

```
┌─────────────────────────────────────────────┐
│         React Control App                   │
│    (localhost:5173 or vite dev)             │
│                                             │
│  ┌── CameraFeeds Page ────────────────────┐ │
│  │                                        │ │
│  │  1. Fetch /video_feed (MJPEG stream)  │ │
│  │  2. Poll /api/zone-status (JSON)      │ │
│  │  3. Display video + zone indicators   │ │
│  └────────────────────────────────────────┘ │
└────────────────┬────────────────────────────┘
                 │ HTTP Requests
                 │ (CORS enabled)
                 ▼
┌─────────────────────────────────────────────┐
│         Flask Backend                       │
│    (localhost:5000)                         │
│                                             │
│  ┌── /video_feed endpoint ───────────────┐ │
│  │  - MJPEG video stream                 │ │
│  │  - Sources from YOLO processing       │ │
│  └───────────────────────────────────────┘ │
│                                             │
│  ┌── /api/zone-status endpoint ──────────┐ │
│  │  - Camera occupancy data              │ │
│  │  - Camera connection status           │ │
│  └───────────────────────────────────────┘ │
│                                             │
│  ┌── YOLO Processing Thread ─────────────┐ │
│  │  - Multi-camera YOLO inference        │ │
│  │  - Zone detection & tracking          │ │
│  │  - Frame generation                   │ │
│  └───────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

---

## Configuration

In the React app, you can configure the stream URL in the CameraFeeds page:

**Default:** `http://localhost:5000/video_feed`

**For remote connections**, update the URL to:
- `http://<your-server-ip>:5000/video_feed`

---

## Expected Data Structure

### Zone Status Response
```json
{
  "cam1": {
    "top_left": false,
    "top_right": true,
    "bottom_left": false,
    "bottom_right": true
  },
  "cam2": {
    "top_left": false,
    "top_right": false,
    "bottom_left": true,
    "bottom_right": false
  },
  "cameraStatus": {
    "cam1": {
      "connected": true,
      "fps": 30
    },
    "cam2": {
      "connected": true,
      "fps": 28
    }
  }
}
```

---

## Testing

1. **Start the backend:**
   ```bash
   python app.py
   ```
   Server should run on `http://localhost:5000`

2. **Start the React dev server:**
   ```bash
   cd control-app
   npm run dev
   ```
   Should run on `http://localhost:5173`

3. **Navigate to Camera Feeds page:**
   - Click "Camera Feeds" in the sidebar
   - You should see:
     - Live video stream from YOLO
     - Zone occupancy indicators
     - Camera connection status
     - Real-time statistics

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Failed to connect to video stream" | Ensure Flask backend is running on port 5000 |
| CORS errors in console | Verify `flask-cors` is installed and `CORS(app)` is called |
| No zone data updating | Check that zone occupancy is being updated in the YOLO loop |
| Video stream is frozen | Verify the frame lock mechanism isn't blocking |
| High CPU usage | Reduce MJPEG frame rate or YOLO inference frequency |

---

## Optional Enhancements

### 1. Add FPS counter
```python
import time

class FPSCounter:
    def __init__(self):
        self.start_time = time.time()
        self.frame_count = 0
    
    def update(self):
        self.frame_count += 1
        elapsed = time.time() - self.start_time
        if elapsed > 1:
            fps = self.frame_count / elapsed
            self.frame_count = 0
            self.start_time = time.time()
            return fps
        return 0
```

### 2. Add authentication token
```python
@app.route('/video_feed')
def video_feed():
    token = request.headers.get('Authorization')
    if not token:
        return 'Unauthorized', 401
    # Validate token...
    return Response(generate_frames(), ...)
```

### 3. Add configurable YOLO parameters
```python
@app.route('/api/config', methods=['GET', 'POST'])
def get_config():
    if request.method == 'POST':
        # Update YOLO config
        pass
    return jsonify({
        'confidence_threshold': CONFIDENCE_THRESHOLD,
        'decision_interval': DECISION_INTERVAL_SEC,
        'camera_count': CAMERA_COUNT
    })
```

---

## Next Steps

1. Update `ecoeye_framed_yolo.py` with the frame-sharing code
2. Create/update `app.py` with Flask backend
3. Install required packages: `pip install flask flask-cors`
4. Start the backend: `python app.py`
5. Start React dev server: `cd control-app && npm run dev`
6. Open "Camera Feeds" page in the sidebar

Enjoy real-time camera monitoring! 🎥
