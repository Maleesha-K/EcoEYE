# ESP32 Firmware Contract for EcoEYE

This document defines the exact command contract expected by EcoEYE runtime.

## 1. Transport Modes

EcoEYE supports two transport modes per device:

1. MQTT (primary)
2. HTTP POST (optional fallback per device)

Each device can be configured in Initial Setup with:
- protocol: mqtt or http
- target: MQTT topic or HTTP endpoint URL

## 2. MQTT Contract

### Topic model
- Per-device topic
- Example: esp32/room1/light1/cmd

### QoS
- QoS 1 (at least once)

### Retain
- false by default

### Payload format
- UTF-8 JSON object

## 3. HTTP Contract

### Method
- POST

### Content-Type
- application/json

### Body
- Same JSON command payload as MQTT

### Response expectation
- 2xx => success
- 4xx/5xx => failure, retried by EcoEYE according to retry policy

## 4. Common JSON Payload Schema

All commands include at least:

```json
{ "power": "on" }
```

or

```json
{ "power": "off" }
```

Optional fields for AC devices:

```json
{
  "power": "on",
  "mode": "cool",
  "temp": 24,
  "fan": "auto"
}
```

## 5. Device Type Behavior

### light / switch
- Required: power
- power=on -> turn relay/device ON
- power=off -> turn relay/device OFF

### ac-ir
- Required: power
- Optional: mode, temp, fan
- power=on with missing optional fields:
  - Firmware may apply local defaults OR use values provided by EcoEYE
- power=off:
  - send IR power-off command

## 6. Idempotency Rules

Commands may arrive more than once (QoS 1 + retries). Firmware should be idempotent:

- Receiving power=on when already ON should not cause errors
- Receiving power=off when already OFF should not cause errors

## 7. Recommended ACK/Status Topic (Optional but Recommended)

Firmware can publish status updates to:
- esp32/<device-id>/state

Payload example:

```json
{
  "deviceId": "light-1",
  "online": true,
  "power": "on",
  "lastCommandTs": 1710000000
}
```

EcoEYE currently does not require ACK to consider command successful, but state topics are useful for observability.

## 8. Error Handling Expectations in Firmware

If payload is malformed:
- ignore safely
- optionally log error to serial

If fields are unknown:
- ignore unknown keys
- apply known keys only

If IR command fails:
- keep system responsive
- optionally publish failure state if using state topic

## 9. Security Expectations (Offline LAN)

- Network is assumed local/trusted in current deployment mode
- For stronger security in future, add:
  - MQTT auth/TLS
  - message signatures
  - allow-list of command sources

## 10. Minimal Validation Checklist

1. Device receives JSON from configured topic/URL
2. power on/off commands work reliably
3. Repeated same command is safe
4. AC commands parse mode/temp/fan
5. Device recovers after WiFi reconnect and resumes listening
