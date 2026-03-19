# EcoEYE

Offline, LAN-only smart energy control platform for Raspberry Pi + ESP32.

EcoEYE lets an admin:
- Sign in securely
- Configure camera sources
- Split each camera into 2 occupancy zones with an adjustable vertical divider
- Map zones to real devices (lights, switches, AC IR blasters)
- Send control commands to ESP32 endpoints using MQTT (primary) or HTTP (optional)

The system is designed for no-internet environments and is containerized with Docker.

---

## 1. What Is Implemented

### Security and Access
- Local username/password login
- Token-based API auth
- Password change support
- First-run setup lock (UI is forced to Initial Setup until minimum setup is completed)

### Initial Setup Wizard
- Multi-camera support
- Camera source types:
  - RTSP
  - HTTP MJPEG
  - USB index
  - Local video file
- Per-camera 2-zone split with adjustable vertical divider
- ESP32 device registry:
  - Device type: light, switch, ac-ir
  - Protocol: mqtt or http
  - Target: topic or URL
  - On/Off command payloads
- Zone-to-device mapping:
  - camera + left/right zone -> device
  - Priority support

### Occupancy Logic
- Zone decision model mirrors prototype logic:
  - person base-point (bottom-center) concept
  - left/right split via divider ratio
- Hold/hysteresis support before turning OFF
- Camera-failure behavior: fail-safe OFF after hold time

### Runtime Control Engine
- Rule: a device turns ON if any mapped zone is occupied
- OFF after hold time when no mapped zone is occupied
- MQTT dispatch:
  - QoS 1
  - retry 3 times with backoff
- HTTP dispatch fallback (for devices configured as HTTP)
- Runtime state and dispatch logs exposed through APIs

### Offline Assistant
- Local intent-based helper chat in UI
- No cloud dependency for assistant replies

### Deployment
- Multi-stage Docker build (React frontend + Python backend)
- Hardened runtime profile suitable for Raspberry Pi constraints

---

## 2. High-Level Architecture

1. Admin uses web UI over LAN
2. Saves setup in Initial Setup wizard
3. Occupancy events are processed per camera (left/right)
4. Control engine computes desired device states
5. Commands are sent to ESP32 devices (MQTT or HTTP)
6. Runtime logs show dispatch success/failure

---

## 3. ESP32 Command Contract

### MQTT (recommended)
- Topic model: per-device topic
- QoS: 1
- Payload: JSON

Example payloads:

```json
{ "power": "on" }
```

```json
{ "power": "off" }
```

For AC IR devices:

```json
{ "power": "on", "mode": "cool", "temp": 24, "fan": "auto" }
```

### HTTP (optional)
- Method: POST
- URL: device target configured in setup
- Body: same JSON payload as MQTT

---

## 4. Prerequisites (Friend Side)

On Raspberry Pi:
- Raspberry Pi OS (64-bit recommended)
- Docker + Docker Compose plugin
- Local WiFi/LAN where Pi and ESP32 boards are connected

On ESP32 side:
- Firmware that can parse JSON commands from MQTT or HTTP
- Smart holder/switch/IR hardware connected to each board

Optional but recommended:
- Local MQTT broker on Pi (Mosquitto)

---

## 5. Clone and Run (Raspberry Pi)

```bash
git clone <your-repo-url>
cd EcoEYE
```

Create env file:

```bash
cp .env.example .env
```

Edit `.env` and set secure values:
- APP_USERNAME
- APP_PASSWORD
- APP_SECRET
- TOKEN_TTL_SECONDS

Build and start:

```bash
docker compose build
docker compose up -d
```

Check status:

```bash
docker compose ps
docker compose logs -f ecoeye-app
```

Open UI from same LAN:
- `http://<PI_IP>:9000`

---

## 6. Optional: Set Up MQTT Broker on Pi

Install Mosquitto:

```bash
sudo apt update
sudo apt install -y mosquitto mosquitto-clients
sudo systemctl enable mosquitto
sudo systemctl start mosquitto
```

Quick broker test:

Terminal 1:

```bash
mosquitto_sub -h 127.0.0.1 -t 'esp32/#' -v
```

Terminal 2:

```bash
mosquitto_pub -h 127.0.0.1 -t 'esp32/test/cmd' -m '{"power":"on"}'
```

In EcoEYE Initial Setup, set MQTT host to Pi IP and port 1883.

---

## 7. First-Time UI Configuration Flow

1. Open `http://<PI_IP>:9000`
2. Login with admin credentials
3. You will be forced to Initial Setup until completed
4. Add at least:
   - 1 camera
   - 1 device
   - 1 zone mapping
5. Save setup
6. System unlocks full navigation

---

## 8. Real Hardware Test Plan (Step by Step)

### Step A: Camera and zone validation
1. Add each CCTV source in Initial Setup
2. For each camera, adjust divider bar to split left/right areas
3. Save
4. Use API zone utility if needed:

```bash
curl -X POST http://<PI_IP>:9000/api/setup/zone-from-basepoint \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"cameraId":"cam-1","basePointX":300,"frameWidth":1000}'
```

### Step B: Device mapping validation
1. Register each ESP32 actuator in Device Registry
2. Set protocol:
   - MQTT target example: `esp32/room1/light1/cmd`
   - HTTP target example: `http://192.168.4.10/control`
3. Define ON/OFF payloads
4. Create mappings from camera zone to device
5. Save

### Step C: Runtime command validation without CV engine
Use manual occupancy event simulation:

```bash
curl -X POST http://<PI_IP>:9000/api/control/occupancy-event \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"cameraId":"cam-1","cameraOnline":true,"zones":{"left":true,"right":false}}'
```

Check runtime state/log:

```bash
curl http://<PI_IP>:9000/api/control/runtime \
  -H 'Authorization: Bearer <TOKEN>'
```

Expected:
- mapped devices for occupied zones attempt ON
- dispatch logs show success/failure with retries

### Step D: End-to-end with real CV source
1. Feed real occupancy events from detection pipeline into `/api/control/occupancy-event`
2. Observe corresponding ESP32 actions on hardware
3. Validate OFF after hold time when occupancy disappears
4. Validate fail-safe OFF when camera goes offline

---

## 9. API Quick Reference

Auth:
- `POST /api/auth/login`
- `GET /api/auth/me`

Setup:
- `GET /api/setup`
- `PUT /api/setup`
- `GET /api/setup/status`
- `POST /api/setup/zone-from-basepoint`

Control:
- `GET /api/control/contract`
- `POST /api/control/occupancy-event`
- `GET /api/control/runtime`

System:
- `GET /health`
- `GET /api/status`

---

## 10. Troubleshooting

### UI opens but device control fails
- Check MQTT host/port in setup
- Check ESP32 topic/endpoint target
- Check runtime logs via `/api/control/runtime`

### MQTT not connected
- Ensure broker is running
- Ensure Pi firewall allows 1883
- Verify host is reachable from container

### Commands not applied on ESP32
- Confirm payload schema support in firmware
- Validate topic names exactly match firmware subscriptions
- If using HTTP, verify endpoint path and method

### Setup lock not releasing
- Ensure at least 1 camera + 1 device + 1 mapping
- Save setup and re-check `/api/setup/status`

---

## 11. Notes for Friend Implementing Hardware

- Keep device targets stable and unique.
- Use per-device MQTT topics to avoid ambiguity.
- For AC IR boards, keep command payload JSON-based.
- Start with manual occupancy-event tests before integrating full CV loop.
- Once stable, connect live occupancy inference pipeline to `/api/control/occupancy-event`.

---

## 12. Security Recommendations for Field Deployment

- Change default admin password immediately
- Use strong random `APP_SECRET`
- Keep system on isolated local network
- Disable internet routing if this is a strict offline deployment
- Backup setup data volume regularly

---

If you need, a separate ESP32 firmware contract document and sample Arduino sketch can be added next.

## 13. Added Firmware Assets

The following files are now included in this repository:

1. ESP32 contract document:
  - [docs/ESP32_FIRMWARE_CONTRACT.md](docs/ESP32_FIRMWARE_CONTRACT.md)
2. Arduino firmware template:
  - [firmware/esp32/ecoeye_esp32_template.ino](firmware/esp32/ecoeye_esp32_template.ino)

Quick use:

1. Open `firmware/esp32/ecoeye_esp32_template.ino` in Arduino IDE.
2. Fill WiFi, MQTT, topic, and device IDs.
3. Flash to ESP32.
4. Verify device receives JSON commands from EcoEYE topic target.
