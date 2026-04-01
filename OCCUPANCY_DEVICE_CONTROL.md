# Occupancy-Based Device Control Implementation

## Overview
This document describes the implementation of occupancy-triggered WiFi device control for the EcoEYE system. When zones become occupied/empty, the system automatically sends ON/OFF signals to registered ESP32 WiFi devices.

## Architecture

### Backend (Flask API)

#### New API Endpoints Added

**1. GET `/api/zones/devices`**
- Returns all zone-to-device mappings
- Response: `{ "zoneDevices": { "cam1:bottom_left": ["192.168.1.50"], ... } }`
- Use case: Frontend loads saved device assignments on initialization

**2. PUT `/api/zones/devices`**
- Saves/updates zone-to-device mappings
- Request: `{ "cam1:bottom_left": ["192.168.1.50", "192.168.1.51"], ... }`
- Validation: Ensures structure is `zone_id: [ip_list]`
- Use case: Frontend syncs device assignments when user adds/removes devices

**3. POST `/api/device/control`**
- Sends ON/OFF control signals to all devices in a zone
- Request payload:
  ```json
  {
    "camKey": "cam1",
    "zoneKey": "bottom_left",
    "occupied": true
  }
  ```
- Response: 
  ```json
  {
    "success": true,
    "message": "Sent 2/2 control signals",
    "zoneId": "cam1:bottom_left",
    "state": "ON",
    "signalsSent": 2
  }
  ```
- Use case: Triggered by occupancy changes to control devices

#### Backend Helper Functions

**`send_device_control_signal(device_ip, state)`**
- Sends HTTP ON/OFF command to ESP device
- Tries 3 fallback endpoints:
  1. GET `http://<ip>/on` or `http://<ip>/off`
  2. GET `http://<ip>/gpio?state=on` or `http://<ip>/gpio?state=off`
  3. POST `http://<ip>/api/control` with `{"state": "on"/"off"}`
- Timeout: 2 seconds per attempt
- Returns: `True` if any endpoint succeeded, `False` otherwise

**`load_zone_devices()`**
- Loads zone-device mappings from `data/zone-devices.json`
- Auto-creates empty dict if file doesn't exist

**`save_zone_devices(zone_devices)`**
- Persists zone-device mappings to `data/zone-devices.json`

### Frontend (React Component)

#### New State Management (CameraFeeds.jsx)

```javascript
const [zoneDevices, setZoneDevices] = useState({})
// Structure: { "cam1:bottom_left": ["192.168.1.50", "192.168.1.51"] }

const [showZoneDeviceModal, setShowZoneDeviceModal] = useState(false)
const [selectedZoneInfo, setSelectedZoneInfo] = useState(null)
const [deviceIpInput, setDeviceIpInput] = useState('')
```

#### Frontend Features

**1. Zone Device Modal**
- Click any zone box → Modal opens
- Input WiFi device IP address
- Add to zone device list
- Remove devices with delete button
- Changes auto-sync to backend via PUT `/api/zones/devices`

**2. Occupancy Change Detection**
- Polls zone occupancy via `/api/camera/zone-status` (500ms interval)
- Detects `False → True` and `True → False` transitions
- On transition: POST `/api/device/control` with new occupancy state

**3. Device Management**
- On component mount: GET `/api/zones/devices` to load saved devices
- On device add/remove: Put zone devices to backend
- Zone device counts displayed as badges on zone boxes

#### Control Flow

```
User adds device IP to zone
    ↓
Frontend state updated
    ↓
syncZoneDevicesToBackend() called
    ↓
PUT /api/zones/devices sent to backend
    ↓
Zone device mapping saved to JSON
    ↓
[Later] YOLO detects occupancy change
    ↓
Frontend detects occupancy transition
    ↓
sendDeviceControlSignal() called with (zoneId, occupied)
    ↓
POST /api/device/control sent to backend
    ↓
Backend retrieves devices for zone
    ↓
send_device_control_signal() called for each device
    ↓
HTTP ON/OFF sent to ESP device
    ↓
Device receives signal and acts (lights ON/OFF, etc.)
```

## Data Storage

### `data/zone-devices.json`
```json
{
  "cam1:top_left": [],
  "cam1:top_right": [],
  "cam1:bottom_left": ["192.168.1.50"],
  "cam1:bottom_right": ["192.168.1.51", "192.168.1.52"],
  "cam2:top_left": [],
  ...
}
```

## User Workflow

### Setting Up Device Control

1. **Navigate to Camera Feeds page**
2. **Click desired zone box** (e.g., "Bottom Left")
3. **Zone Device Modal appears** with input field
4. **Paste WiFi device IP address** (e.g., `192.168.1.50`)
5. **Click "Add Device"** button
6. Device is added to zone and automatically synced to backend
7. **Add more devices** as needed for that zone
8. **Close modal** when done

### Operation

- Once devices are assigned to zones, the system runs automatically
- When YOLO detects occupancy change in a zone:
  - All registered devices for that zone receive control signal
  - Signal: "ON" when zone becomes occupied
  - Signal: "OFF" when zone becomes empty
- Devices respond based on their programmed behavior

## Implementation Details

### File Changes

**Backend (app.py)**
- Lines 710-740: `send_device_control_signal()` function
- Lines 742-780: `load_zone_devices()` and `save_zone_devices()` functions
- Lines 1464-1530: Three new API endpoints

**Frontend (CameraFeeds.jsx)**
- Line 2: Added `useRef` import
- Lines 72-75: Zone device state variables
- Lines 95-104: Load zone devices on mount (useEffect)
- Lines 230-262: Add device to zone + backend sync
- Lines 264-275: Remove device from zone + backend sync
- Lines 277-287: Sync function to PUT zone devices
- Lines 289-313: Send device control signal function
- Lines 315-333: Occupancy change detection effect

**Frontend (CameraFeeds.css)**
- Modal styling for device management interface
- Device list item styling
- Zone device badge styling

## Testing the Feature

### Manual Test Steps

1. **Start Backend & Frontend**
   ```powershell
   # Terminal 1 - Backend
   cd EcoEYE
   $env:APP_PORT=5000
   python app.py
   
   # Terminal 2 - Frontend
   cd control-app
   npm run dev
   ```

2. **Assign Device to Zone**
   - Open http://localhost:5175
   - Go to Camera Feeds
   - Click a zone box
   - Enter ESP device IP: `192.168.1.50`
   - Click "Add Device"

3. **Verify Backend Storage**
   - Check `data/zone-devices.json`
   - Device should appear in zone mapping

4. **Trigger Occupancy Change**
   - Move through camera view
   - Watch browser console: You'll see logs like:
     ```
     [cam1:bottom_left] Occupancy: OCCUPIED → Sent 1/1 control signals
     [cam1:bottom_left] Occupancy: EMPTY → Sent 1/1 control signals
     ```

5. **Monitor ESP Device**
   - Watch ESP device logs or web interface
   - HTTP requests with ON/OFF states should appear
   - Device should respond (LED on/off, relay triggered, etc.)

### API Testing with cURL

**Get zone devices:**
```bash
curl http://localhost:5000/api/zones/devices
```

**Save zone devices:**
```bash
curl -X PUT http://localhost:5000/api/zones/devices \
  -H "Content-Type: application/json" \
  -d '{"cam1:bottom_left": ["192.168.1.50"]}'
```

**Send control signal:**
```bash
curl -X POST http://localhost:5000/api/device/control \
  -H "Content-Type: application/json" \
  -d '{"camKey": "cam1", "zoneKey": "bottom_left", "occupied": true}'
```

## Error Handling

### Frontend
- Zone device API errors logged to console
- Failed device control signals don't block occupancy detection
- Gracefully handles missing zone devices

### Backend
- Device IP validation: Ensures list format
- Occupancy payload validation: Requires camKey, zoneKey
- Device control retry: Tries 3 different HTTP endpoints before failing
- Timeout handling: 2-second timeout prevents hanging on unresponsive devices
- Logs all control signal attempts for debugging

## Future Enhancements

1. **Device Response Feedback**
   - Track HTTP response codes from ESP devices
   - Alert user if device is unreachable
   - Visual indicator in UI showing device status

2. **Advanced Device Rules**
   - Multiple devices per zone with different logic
   - Zone occupancy threshold (e.g., >2 people detected)
   - Time-based rules (e.g., only control during business hours)

3. **Device Health Monitoring**
   - Periodic ping to all registered devices
   - Detect offline/unresponsive devices
   - Alert dashboard showing device status

4. **Integration Options**
   - MQTT support for device communication
   - HomeAssistant integration
   - Custom webhook support

---

## Quick Reference

| Component | File | Lines |
|-----------|------|-------|
| Zone device API endpoints | app.py | 1464-1530 |
| Device control functions | app.py | 710-780 |
| Zone device modal | CameraFeeds.jsx | ~230 |
| Occupancy change detection | CameraFeeds.jsx | 315-333 |
| Device sync function | CameraFeeds.jsx | 277-287 |
| Modal styling | CameraFeeds.css | Add/Remove sections |

