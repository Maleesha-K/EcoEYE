# EcoEYE

EcoEYE is an offline, LAN-only, occupancy-aware energy control platform designed for Raspberry Pi and ESP32 deployments.

It provides a secure admin web app to configure cameras, define left/right occupancy zones, map zones to devices, and dispatch control commands over MQTT or HTTP.

## TL;DR

1. Deploy with Docker on Raspberry Pi.
2. Login as admin on local network.
3. Complete Initial Setup wizard.
4. Add CCTV sources, adjust divider per camera.
5. Register ESP32 devices and map zones to them.
6. Feed occupancy events.
7. Verify device actions in runtime logs.

---

## 1. Implemented Features

### Security
- Local username/password authentication
- Signed token-based API access
- Password change flow
- First-run setup lock until minimum setup is complete

### Initial Setup Wizard
- Multi-camera source configuration
- Supported source types:
  - RTSP
  - HTTP MJPEG
  - USB camera index
  - Local video file
- Per-camera adjustable vertical divider for 2-zone split
- ESP32 device registry:
  - Device types: light, switch, ac-ir
  - Protocol per device: mqtt or http
  - Target per device: topic or URL
  - JSON command payloads for ON/OFF
- Zone-to-device mapping with priority

### Control Runtime
- Rule: device ON if any mapped zone is occupied
- OFF after hold time if all mapped zones are empty
- Camera failure policy support (fail-safe OFF)
- MQTT delivery:
  - QoS 1
  - Retry 3 times with backoff
- HTTP fallback per device config
- Runtime introspection APIs:
  - zone state
  - device state
  - dispatch log

### Occupancy Logic Compatibility
- Matches prototype strategy from test scripts:
  - Bottom-center person point concept
  - Left/right zone split by divider
  - Time-based hold before OFF

### Web and Deployment
- React frontend + Flask API backend
- Multi-stage Docker build
- Hardened runtime defaults for resource-constrained boards
- LAN access via `0.0.0.0`

---

## 2. Repository Structure

```text
EcoEYE/
├── app.py
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── .env.example
├── README.md
├── docs/
│   └── ESP32_FIRMWARE_CONTRACT.md
├── firmware/
│   └── esp32/
│       └── ecoeye_esp32_template.ino
├── scripts/
│   └── install_pi.sh
└── control-app/
    └── src/
        ├── pages/InitialSetup.jsx
        ├── pages/Settings.jsx
        └── ...
```

---

## 3. System Architecture

1. Admin accesses UI on Pi over local WiFi/LAN.
2. Setup wizard stores camera, divider, device, and mapping config.
3. Occupancy pipeline posts zone events to control API.
4. Runtime computes desired device state transitions.
5. Commands are delivered to ESP32 (MQTT preferred, HTTP optional).
6. Runtime logs expose success/failure and retries.

---

## 4. Pre-Requisites for Hardware Deployment

### Raspberry Pi
- Raspberry Pi OS (64-bit recommended)
- Docker Engine + Docker Compose plugin
- Static or known local IP preferred

### Network
- Pi and ESP32 boards on same local network
- If strict offline mode is required, disable internet uplink at router/AP level

### ESP32
- Firmware capable of parsing JSON commands from MQTT or HTTP
- Connected relays/switches/IR hardware

### Optional
- Mosquitto broker running on Pi (recommended)

---

## 5. Quick Start on Raspberry Pi

### 5.1 One-command installer (recommended)

Run this on Raspberry Pi:

```bash
curl -fsSL https://raw.githubusercontent.com/<YOUR_ORG_OR_USER>/<YOUR_REPO>/main/scripts/install_pi.sh -o install_pi.sh
chmod +x install_pi.sh
./install_pi.sh --repo-url https://github.com/<YOUR_ORG_OR_USER>/<YOUR_REPO>.git --branch main --app-dir ~/EcoEYE
```

What it does:
1. Installs Docker (if missing)
2. Ensures Docker Compose plugin exists
3. Clones or updates repository
4. Creates `.env` from `.env.example` if needed
5. Builds and starts containers
6. Waits for health check to pass

### 5.2 Manual install (fallback)

```bash
git clone <your-repo-url>
cd EcoEYE
cp .env.example .env
```

Edit `.env` and set secure values:
- `APP_USERNAME`
- `APP_PASSWORD`
- `APP_SECRET`
- `TOKEN_TTL_SECONDS`

```bash
docker compose build
docker compose up -d
```

### 5.3 Verify service

```bash
docker compose ps
docker compose logs -f ecoeye-app
curl http://localhost:9000/health
```

### 5.4 Access UI

Open on any client in same LAN:

`http://<PI_IP>:9000`

---

## 6. MQTT Broker Setup (Recommended)

Install Mosquitto on Pi:

```bash
sudo apt update
sudo apt install -y mosquitto mosquitto-clients
sudo systemctl enable mosquitto
sudo systemctl start mosquitto
```

Smoke test:

Terminal A:

```bash
mosquitto_sub -h 127.0.0.1 -t 'esp32/#' -v
```

Terminal B:

```bash
mosquitto_pub -h 127.0.0.1 -t 'esp32/test/cmd' -m '{"power":"on"}'
```

In Initial Setup, configure `control.mqtt.host` and `control.mqtt.port` accordingly.

---

## 7. First Login and Setup Flow

1. Open `http://<PI_IP>:9000`.
2. Login as admin.
3. App locks to Initial Setup until minimum config exists.
4. Configure at least:
   - 1 camera
   - 1 device
   - 1 mapping
5. Save setup.
6. App unlocks full navigation.

---

## 8. Camera and Zone Configuration Guide

### 8.1 Add camera
- Name camera clearly (e.g., `Lounge Cam`).
- Choose source type.
- Add source value:
  - RTSP example: `rtsp://192.168.1.20:554/stream1`
  - MJPEG example: `http://192.168.1.25:8080/video`
  - USB example: `0`
  - File example: `/data/test/cam1.mp4`

### 8.2 Set divider
- Use slider or visual divider preview.
- Divider ratio controls left/right boundaries.

### 8.3 Validate zone math

Call utility endpoint:

```bash
curl -X POST http://<PI_IP>:9000/api/setup/zone-from-basepoint \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"cameraId":"cam-1","basePointX":300,"frameWidth":1000}'
```

---

## 9. ESP32 Device Registration Guide

For each actuator:

1. Add device name and type.
2. Select protocol.
3. Set target:
   - MQTT topic example: `esp32/room1/light1/cmd`
   - HTTP endpoint example: `http://192.168.4.10/control`
4. Set command payloads:

Light/switch ON:

```json
{"power":"on"}
```

Light/switch OFF:

```json
{"power":"off"}
```

AC ON:

```json
{"power":"on","mode":"cool","temp":24,"fan":"auto"}
```

AC OFF:

```json
{"power":"off"}
```

---

## 10. Zone-to-Device Mapping Rules

- Map each camera side (`left`, `right`) to one or more devices.
- Device ON policy: ON if any mapped zone is occupied.
- Device OFF policy: OFF when all mapped zones are empty for hold duration.
- Hold time and retry settings are configured in runtime policy section.

---

## 11. Runtime Policy Tuning

Configurable in Initial Setup:
- Hold seconds
- MQTT host/port/QoS
- Retry attempts and backoff
- Camera fail policy
- AC defaults (mode/temp/fan)

Recommended starting values:
- Hold: `30s`
- QoS: `1`
- Retry attempts: `3`
- Backoff: `500ms`
- Camera fail policy: `fail-safe-off`

---

## 12. Hardware Validation Plan

### Phase 1: Device transport validation

1. Subscribe to test topic on broker.
2. Publish test JSON manually.
3. Confirm ESP32 applies action.

### Phase 2: EcoEYE dispatch validation (without CV)

1. Login and complete setup.
2. Simulate occupancy event:

```bash
curl -X POST http://<PI_IP>:9000/api/control/occupancy-event \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"cameraId":"cam-1","cameraOnline":true,"zones":{"left":true,"right":false}}'
```

3. Inspect runtime:

```bash
curl http://<PI_IP>:9000/api/control/runtime \
  -H 'Authorization: Bearer <TOKEN>'
```

Expected:
- Action entries present
- Dispatch result includes attempts/success/failure

### Phase 3: End-to-end occupancy control

1. Connect real detection pipeline to POST `/api/control/occupancy-event`.
2. Move person through camera zones.
3. Confirm corresponding device transitions.
4. Confirm OFF after hold time.
5. Confirm fail-safe OFF when camera is marked offline.

---

## 13. API Reference

### Auth
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/change-password`

### Setup
- `GET /api/setup`
- `PUT /api/setup`
- `GET /api/setup/status`
- `POST /api/setup/zone-from-basepoint`

### Control
- `GET /api/control/contract`
- `POST /api/control/occupancy-event`
- `GET /api/control/runtime`

### System
- `GET /health`
- `GET /api/status`

---

## 14. Included Firmware Assets

1. ESP32 contract specification:
   - [docs/ESP32_FIRMWARE_CONTRACT.md](docs/ESP32_FIRMWARE_CONTRACT.md)
2. Arduino template firmware:
   - [firmware/esp32/ecoeye_esp32_template.ino](firmware/esp32/ecoeye_esp32_template.ino)

Quick usage:
1. Open [firmware/esp32/ecoeye_esp32_template.ino](firmware/esp32/ecoeye_esp32_template.ino) in Arduino IDE.
2. Fill WiFi, broker, device ID, and topic values.
3. Flash ESP32.
4. Verify command reception from EcoEYE.

---

## 15. Troubleshooting Matrix

### UI reachable, no device action
- Verify mapping exists for tested camera zone.
- Verify device target and protocol.
- Inspect dispatch logs via `/api/control/runtime`.

### MQTT disconnected in health/runtime
- Check broker process on Pi.
- Check host/port in setup control policy.
- Check container network reachability.

### Setup remains locked
- Ensure setup has minimum entities.
- Save setup and check `/api/setup/status`.

### ESP32 receives message but no physical action
- Verify relay wiring and active-high/low polarity.
- Validate firmware parsing for payload keys.

---

## 16. Security and Operations

- Change admin password immediately.
- Use strong random `APP_SECRET`.
- Keep deployment on isolated LAN/VLAN.
- Disable internet routing if required by policy.
- Back up setup data volume before upgrades.
- Use controlled rollouts and smoke tests after firmware changes.

---

## 17. Handoff Checklist for Your Friend

1. Run one-command installer on Pi using [scripts/install_pi.sh](scripts/install_pi.sh).
2. Start MQTT broker on Pi.
3. Flash ESP32 firmware template with real topics.
4. Complete Initial Setup in web app.
5. Run occupancy-event simulation tests.
6. Validate physical relay/IR switching.
7. Integrate real occupancy event producer.
8. Run final acceptance test with real movement through zones.
