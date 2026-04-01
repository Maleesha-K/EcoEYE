import base64
import hashlib
import hmac
import json
import os
import secrets
import threading
import time
from functools import wraps
from pathlib import Path

import cv2
import requests
import socket
import subprocess
import ecoeye_framed_yolo
from flask import Flask, Response, jsonify, request, send_from_directory
from flask_cors import CORS
from paho.mqtt import client as mqtt_client

from ecoeye_framed_yolo import run_stream_processor

app = Flask(__name__)
CORS(app)

APP_DIR = Path(__file__).parent
FRONTEND_DIR = APP_DIR / "frontend" / "dist"
DATA_DIR = APP_DIR / "data"
SETTINGS_FILE = DATA_DIR / "settings.json"
AUTH_FILE = DATA_DIR / "auth.json"
SETUP_FILE = DATA_DIR / "setup.json"
CAMERA_CONFIG_FILE = DATA_DIR / "camera-config.json"

APP_VERSION = "3.0.0"
try:
    TOKEN_TTL_SECONDS = int(os.getenv("TOKEN_TTL_SECONDS", "28800"))
except (ValueError, TypeError):
    TOKEN_TTL_SECONDS = 28800
TOKEN_SECRET = os.getenv("APP_SECRET", "change-this-secret-on-first-boot")
STARTED_AT = time.time()

DEFAULT_SETTINGS = {
    "cameraIp": "192.168.1.100",
    "cameraPort": "554",
    "cameraProtocol": "rtsp",
    "mqttBroker": "192.168.1.1",
    "mqttPort": "1883",
    "mqttTopic": "ecoeye/control",
    "hysteresisDelay": "30",
    "occupancyThreshold": "0",
    "inferenceRate": "5",
    "alertEmail": "admin@ecoeye.local",
    "alertOnDisconnect": True,
    "alertOnHighTemp": True,
    "alertOnOccupancyZero": False,
    "darkMode": True,
    "compactView": False,
    "autoRefresh": True,
}

DEFAULT_SETUP = {
    "version": 2,
    "autoTurnOffWhenEmpty": True,
    "occupancyDecisionIntervalSec": 1.0,
    "cameras": [
        {
            "id": "cam-1",
            "name": "Main Camera",
            "sourceType": "rtsp",
            "source": "rtsp://192.168.1.10:554/stream1",
            "dividerRatio": 0.5,
            "enabled": True,
        }
    ],
    "devices": [
        {
            "id": "dev-1",
            "name": "Lounge Lights",
            "kind": "light",
            "protocol": "mqtt",
            "target": "esp32/lounge/cmd",
            "onCommand": "{\"power\":\"on\"}",
            "offCommand": "{\"power\":\"off\"}",
            "meta": {},
        }
    ],
    "zoneMappings": [
        {
            "id": "map-1",
            "cameraId": "cam-1",
            "zone": "left",
            "deviceId": "dev-1",
            "priority": 1,
            "mode": "occupancy",
        }
    ],
    "control": {
        "setupCompleted": False,
        "topicModel": "per-device",
        "holdSeconds": 30,
        "cameraFailPolicy": "fail-safe-off",
        "mqtt": {
            "host": "192.168.1.1",
            "port": 1883,
            "qos": 1,
            "retain": False,
            "clientId": "ecoeye-controller",
        },
        "retry": {
            "attempts": 3,
            "backoffMs": 500,
        },
        "acDefaults": {
            "power": "on",
            "mode": "cool",
            "temp": 24,
            "fan": "auto",
        },
    },
}

DEFAULT_CAMERA_CONFIG = {
    "cameraCount": 2,
    "cameraSources": [
        "http://10.10.1.8:8080/video",
        "http://10.10.1.9:8080/video"
    ],
    "slotSeconds": 1.0,
    "tileWidth": 480,
    "tileHeight": 270,
    "decisionIntervalSec": 1.0,
    "confidenceThreshold": 0.4
}

RUNTIME_STATE = {
    "zoneState": {},
    "deviceState": {},
    "dispatchLog": [],
    "mqttConnected": False,
    "mqttConfig": None,
}
RUNTIME_LOCK = threading.Lock()
MQTT_CLIENT = None

STREAM_LOCK = threading.Lock()
STREAM_STATE = {
    "jpeg": None,
    "zoneStatus": {},
    "cameraStatus": {},
    "lastFrameAt": 0.0,
    "runtimeError": "",
}
STREAM_THREAD = None
STREAM_STOP_EVENT = None

CONTROL_SYNC_THREAD = None
CONTROL_SYNC_STOP_EVENT = None

DISCOVERY_STATE = {
    "discoveredDevices": {}, # ip -> {id, name, lastSeen}
}
DISCOVERY_THREAD = None
DISCOVERY_STOP_EVENT = None

CAMERA_DISCOVERY_STATE = {
    "discoveredCameras": {}, # ip -> {lastSeen}
}
CAMERA_DISCOVERY_THREAD = None
CAMERA_DISCOVERY_STOP_EVENT = None


def _stream_state_callback(frame_bgr, zone_status, camera_status):
    ok, encoded = cv2.imencode(".jpg", frame_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
    if not ok:
        return

    with STREAM_LOCK:
        STREAM_STATE["jpeg"] = encoded.tobytes()
        STREAM_STATE["zoneStatus"] = zone_status
        STREAM_STATE["cameraStatus"] = camera_status
        STREAM_STATE["lastFrameAt"] = time.time()
        STREAM_STATE["runtimeError"] = ""


def _stream_worker(stop_event):
    try:
        run_stream_processor(state_callback=_stream_state_callback, stop_event=stop_event, start_inference=True)
    except Exception as ex:
        with STREAM_LOCK:
            STREAM_STATE["runtimeError"] = str(ex)


def ensure_stream_runtime_started():
    global STREAM_THREAD, STREAM_STOP_EVENT

    if STREAM_THREAD is not None and STREAM_THREAD.is_alive():
        return

    STREAM_STOP_EVENT = threading.Event()
    STREAM_THREAD = threading.Thread(target=_stream_worker, args=(STREAM_STOP_EVENT,), daemon=True)
    STREAM_THREAD.start()


def generate_mjpeg_stream():
    while True:
        ensure_stream_runtime_started()

        with STREAM_LOCK:
            jpeg = STREAM_STATE.get("jpeg")

        if jpeg is None:
            time.sleep(0.05)
            continue

        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n"
            b"Content-Length: " + str(len(jpeg)).encode("ascii") + b"\r\n\r\n" + jpeg + b"\r\n"
        )

        time.sleep(0.03)


def ensure_data_files():
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    if not SETTINGS_FILE.exists():
        SETTINGS_FILE.write_text(json.dumps(DEFAULT_SETTINGS, indent=2), encoding="utf-8")

    if not AUTH_FILE.exists():
        username = os.getenv("APP_USERNAME", "admin")
        initial_password = os.getenv("APP_PASSWORD", "changeme")
        salt = secrets.token_hex(16)
        password_hash = hash_password(initial_password, salt)
        auth_doc = {
            "username": username,
            "salt": salt,
            "password_hash": password_hash,
            "mustChangePassword": initial_password == "changeme",
        }
        AUTH_FILE.write_text(json.dumps(auth_doc, indent=2), encoding="utf-8")

    if not SETUP_FILE.exists():
        SETUP_FILE.write_text(json.dumps(DEFAULT_SETUP, indent=2), encoding="utf-8")


def hash_password(password: str, salt: str) -> str:
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120000)
    return derived.hex()


def load_auth_doc():
    ensure_data_files()
    return json.loads(AUTH_FILE.read_text(encoding="utf-8"))


def save_auth_doc(auth_doc):
    AUTH_FILE.write_text(json.dumps(auth_doc, indent=2), encoding="utf-8")


def load_camera_config():
    ensure_data_files()
    try:
        config = json.loads(CAMERA_CONFIG_FILE.read_text(encoding="utf-8"))
        merged = dict(DEFAULT_CAMERA_CONFIG)
        merged.update(config)
        return merged
    except Exception:
        return dict(DEFAULT_CAMERA_CONFIG)


def save_camera_config(config_doc):
    CAMERA_CONFIG_FILE.write_text(json.dumps(config_doc, indent=2), encoding="utf-8")


def validate_camera_config(config):
    if not isinstance(config, dict):
        return "Config must be an object"

    required_keys = [
        "cameraCount",
        "cameraSources",
        "slotSeconds",
        "tileWidth",
        "tileHeight",
        "decisionIntervalSec",
        "confidenceThreshold",
    ]
    for key in required_keys:
        if key not in config:
            return f"Missing required key: {key}"

    if not isinstance(config.get("cameraSources"), list) or len(config.get("cameraSources", [])) < 1:
        return "cameraSources must be a non-empty list"

    if int(config.get("cameraCount", 0)) != len(config.get("cameraSources", [])):
        return "cameraCount must match number of cameraSources"

    return None


def restart_stream_processor():
    global STREAM_THREAD, STREAM_STOP_EVENT

    if STREAM_STOP_EVENT is not None:
        STREAM_STOP_EVENT.set()

    if STREAM_THREAD is not None and STREAM_THREAD.is_alive():
        STREAM_THREAD.join(timeout=2.0)

    with STREAM_LOCK:
        STREAM_STATE["jpeg"] = None
        STREAM_STATE["zoneStatus"] = {}
        STREAM_STATE["cameraStatus"] = {}
        STREAM_STATE["lastFrameAt"] = 0.0
        STREAM_STATE["runtimeError"] = ""

    STREAM_THREAD = None
    STREAM_STOP_EVENT = None
    ensure_stream_runtime_started()
    ensure_control_bridge_started()
    ensure_discovery_started()


def ensure_control_bridge_started():
    global CONTROL_SYNC_THREAD, CONTROL_SYNC_STOP_EVENT

    if CONTROL_SYNC_THREAD is not None and CONTROL_SYNC_THREAD.is_alive():
        return

    CONTROL_SYNC_STOP_EVENT = threading.Event()
    CONTROL_SYNC_THREAD = threading.Thread(target=_control_bridge_worker, args=(CONTROL_SYNC_STOP_EVENT,), daemon=True)
    CONTROL_SYNC_THREAD.start()


def _control_bridge_worker(stop_event):
    """
    Background worker that bridges CV detections to the control logic.
    Periodically checks STREAM_STATE and dispatches necessary commands.
    """
    print("CV-to-Control Bridge thread started")
    last_decision_time = 0.0

    while not stop_event.is_set():
        try:
            setup_doc = load_setup()
            interval = float(setup_doc.get("occupancyDecisionIntervalSec", 1.0))
            now = time.time()

            if now - last_decision_time < interval:
                time.sleep(0.1)
                continue

            with STREAM_LOCK:
                zone_status = dict(STREAM_STATE.get("zoneStatus", {}))
                camera_status = dict(STREAM_STATE.get("cameraStatus", {}))

            if not zone_status:
                time.sleep(0.5)
                continue

            for cam_id, zones in zone_status.items():
                camera_online = camera_status.get(cam_id, {}).get("connected", True)
                apply_zone_event_to_runtime(setup_doc, cam_id, zones, camera_online=camera_online)

            evaluate_and_dispatch(setup_doc)
            last_decision_time = now

        except Exception as ex:
            print(f"Error in control_bridge_worker: {ex}")
            time.sleep(2.0)

        time.sleep(0.2)



def ensure_discovery_started():
    global DISCOVERY_THREAD, DISCOVERY_STOP_EVENT

    if DISCOVERY_THREAD is not None and DISCOVERY_THREAD.is_alive():
        return

    DISCOVERY_STOP_EVENT = threading.Event()
    DISCOVERY_THREAD = threading.Thread(target=_discovery_worker, args=(DISCOVERY_STOP_EVENT,), daemon=True)
    DISCOVERY_THREAD.start()


def _discovery_worker(stop_event):
    """
    Listens for UDP broadcast 'Hello' signals from ESP32s on port 4211.
    Format expected: ESP32-HELLO:<NAME>:<ID>
    """
    print("UDP Discovery Listener started on port 4211")
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        sock.bind(("", 4211)) # Listen on all interfaces
        sock.settimeout(1.0)
    except Exception as ex:
        print(f"Failed to bind discovery socket: {ex}")
        return

    while not stop_event.is_set():
        try:
            data, addr = sock.recvfrom(1024)
            message = data.decode("utf-8").strip()
            
            if message.startswith("ESP32-HELLO:"):
                parts = message.split(":")
                if len(parts) >= 3:
                    name = parts[1]
                    dev_id = parts[2]
                    ip = addr[0]
                    
                    with RUNTIME_LOCK:
                        DISCOVERY_STATE["discoveredDevices"][ip] = {
                            "id": dev_id,
                            "name": name,
                            "ip": ip,
                            "lastSeen": time.time()
                        }
        except socket.timeout:
            continue
        except Exception as ex:
            print(f"Discovery error: {ex}")
            time.sleep(1.0)

    sock.close()


def ensure_camera_discovery_started():
    global CAMERA_DISCOVERY_THREAD, CAMERA_DISCOVERY_STOP_EVENT

    if CAMERA_DISCOVERY_THREAD is not None and CAMERA_DISCOVERY_THREAD.is_alive():
        return

    CAMERA_DISCOVERY_STOP_EVENT = threading.Event()
    CAMERA_DISCOVERY_THREAD = threading.Thread(target=_camera_discovery_worker, args=(CAMERA_DISCOVERY_STOP_EVENT,), daemon=True)
    CAMERA_DISCOVERY_THREAD.start()


def _camera_discovery_worker(stop_event):
    """
    Scans the local subnet for devices with port 554 (RTSP) open.
    """
    print("RTSP Camera Discovery Scanner started")
    
    while not stop_event.is_set():
        try:
            # 1. Determine local subnet
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            try:
                # connect to a dummy address to find local interface ip
                s.connect(("8.8.8.8", 80))
                local_ip = s.getsockname()[0]
            except Exception:
                local_ip = "127.0.0.1"
            finally:
                s.close()
            
            # Simple heuristic for common home/hotspot subnets
            # e.g. 172.20.10.x or 192.168.1.x
            prefix = ".".join(local_ip.split(".")[:-1]) + ".*"
            
            # We use a shell command to ping sweep or just a fast loop
            # For simplicity and reliability in various environments, 
            # let's use a loop with short timeouts.
            base_prefix = ".".join(local_ip.split(".")[:-1]) + "."
            
            for i in range(1, 255):
                if stop_event.is_set():
                    break
                    
                target_ip = base_prefix + str(i)
                if target_ip == local_ip:
                    continue
                
                # Check port 554
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.settimeout(0.05) # Very fast scan
                    result = s.connect_ex((target_ip, 554))
                    if result == 0:
                        with RUNTIME_LOCK:
                            CAMERA_DISCOVERY_STATE["discoveredCameras"][target_ip] = {
                                "ip": target_ip,
                                "lastSeen": time.time()
                            }
            
            # Scan finished, wait before next full scan
            for _ in range(300): # 5 minutes
                if stop_event.is_set():
                    break
                time.sleep(1)
                
        except Exception as ex:
            print(f"Camera discovery error: {ex}")
            time.sleep(5.0)


def load_settings():
    ensure_data_files()
    settings = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
    merged = dict(DEFAULT_SETTINGS)
    merged.update(settings)
    return merged


def save_settings(settings_doc):
    SETTINGS_FILE.write_text(json.dumps(settings_doc, indent=2), encoding="utf-8")


def merge_control(existing_control):
    merged = json.loads(json.dumps(DEFAULT_SETUP["control"]))
    if isinstance(existing_control, dict):
        for k in ["setupCompleted", "topicModel", "holdSeconds", "cameraFailPolicy"]:
            if k in existing_control:
                merged[k] = existing_control[k]
        if isinstance(existing_control.get("mqtt"), dict):
            merged["mqtt"].update(existing_control["mqtt"])
        if isinstance(existing_control.get("retry"), dict):
            merged["retry"].update(existing_control["retry"])
        if isinstance(existing_control.get("acDefaults"), dict):
            merged["acDefaults"].update(existing_control["acDefaults"])
    return merged


def load_setup():
    ensure_data_files()
    existing = json.loads(SETUP_FILE.read_text(encoding="utf-8"))
    merged = dict(DEFAULT_SETUP)
    merged.update(existing)

    merged["cameras"] = existing.get("cameras") if isinstance(existing.get("cameras"), list) else list(DEFAULT_SETUP["cameras"])
    merged["devices"] = existing.get("devices") if isinstance(existing.get("devices"), list) else list(DEFAULT_SETUP["devices"])
    merged["zoneMappings"] = existing.get("zoneMappings") if isinstance(existing.get("zoneMappings"), list) else list(DEFAULT_SETUP["zoneMappings"])
    merged["control"] = merge_control(existing.get("control"))

    return merged


def save_setup(setup_doc):
    SETUP_FILE.write_text(json.dumps(setup_doc, indent=2), encoding="utf-8")


def is_setup_complete(setup_doc):
    return (
        isinstance(setup_doc.get("cameras"), list)
        and len(setup_doc["cameras"]) >= 1
        and isinstance(setup_doc.get("devices"), list)
        and len(setup_doc["devices"]) >= 1
        and isinstance(setup_doc.get("zoneMappings"), list)
        and len(setup_doc["zoneMappings"]) >= 1
    )


def validate_setup(payload):
    if not isinstance(payload, dict):
        return "Setup payload must be an object"

    for key in ["cameras", "devices", "zoneMappings"]:
        if key not in payload or not isinstance(payload[key], list):
            return f"Setup must include a list: {key}"

    valid_source_types = {"rtsp", "http-mjpeg", "usb", "file"}
    valid_zones = {"left", "right", "top_left", "top_right", "bottom_left", "bottom_right"}
    valid_protocols = {"mqtt", "http", "socket-udp", "socket-tcp"}

    camera_ids = set()
    for cam in payload["cameras"]:
        if not isinstance(cam, dict):
            return "Each camera must be an object"
        for cam_key in ["id", "name", "sourceType", "source", "dividerRatio"]:
            if cam_key not in cam:
                return f"Camera missing field: {cam_key}"
        if cam["sourceType"] not in valid_source_types:
            return f"Unsupported camera sourceType: {cam['sourceType']}"
        if not (0.05 <= float(cam["dividerRatio"]) <= 0.95):
            return "Camera dividerRatio must be between 0.05 and 0.95"
        camera_ids.add(cam["id"])

    device_ids = set()
    for dev in payload["devices"]:
        if not isinstance(dev, dict):
            return "Each device must be an object"
        for dev_key in ["id", "name", "kind", "protocol", "target", "onCommand", "offCommand"]:
            if dev_key not in dev:
                return f"Device missing field: {dev_key}"
        if dev["protocol"] not in valid_protocols:
            return f"Unsupported device protocol: {dev['protocol']}"
        device_ids.add(dev["id"])

    for mapping in payload["zoneMappings"]:
        if not isinstance(mapping, dict):
            return "Each mapping must be an object"
        for map_key in ["id", "cameraId", "zone", "deviceId"]:
            if map_key not in mapping:
                return f"Mapping missing field: {map_key}"
        if mapping["cameraId"] not in camera_ids:
            return f"Mapping references unknown cameraId: {mapping['cameraId']}"
        if mapping["deviceId"] not in device_ids:
            return f"Mapping references unknown deviceId: {mapping['deviceId']}"
        if mapping["zone"] not in valid_zones:
            return "Mapping zone must be 'left' or 'right'"

    return None


def sign_payload(payload: str) -> str:
    return hmac.new(TOKEN_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def create_token(username: str) -> str:
    expires_at = int(time.time()) + TOKEN_TTL_SECONDS
    payload = f"{username}|{expires_at}"
    signature = sign_payload(payload)
    token_raw = f"{payload}|{signature}".encode("utf-8")
    return base64.urlsafe_b64encode(token_raw).decode("utf-8")


def verify_token(token: str):
    try:
        decoded = base64.urlsafe_b64decode(token.encode("utf-8")).decode("utf-8")
        username, expires_at_str, signature = decoded.split("|", 2)
        payload = f"{username}|{expires_at_str}"
        if not hmac.compare_digest(signature, sign_payload(payload)):
            return None
        if int(expires_at_str) < int(time.time()):
            return None
        return username
    except Exception:
        return None


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Missing bearer token"}), 401
        token = auth_header.split(" ", 1)[1].strip()
        username = verify_token(token)
        if not username:
            return jsonify({"error": "Invalid or expired token"}), 401
        request.user = username
        return fn(*args, **kwargs)

    return wrapper


def classify_intent(message: str) -> str:
    lowered = message.lower()
    if any(term in lowered for term in ["status", "health", "online", "running"]):
        return "status"
    if any(term in lowered for term in ["settings", "camera", "mqtt", "configure", "config"]):
        return "settings"
    if any(term in lowered for term in ["zone", "occupancy", "people"]):
        return "zones"
    if any(term in lowered for term in ["restart", "reboot", "service"]):
        return "restart"
    return "help"


def chatbot_reply(message: str):
    intent = classify_intent(message)
    settings = load_settings()
    setup = load_setup()
    uptime_seconds = int(time.time() - STARTED_AT)

    if intent == "status":
        return {
            "intent": intent,
            "reply": (
                f"EcoEYE is online. Uptime is {uptime_seconds} seconds. "
                f"Setup complete is {is_setup_complete(setup)}."
            ),
        }

    if intent == "settings":
        camera_count = len(setup.get("cameras", []))
        mapping_count = len(setup.get("zoneMappings", []))
        return {
            "intent": intent,
            "reply": (
                "Current key settings: "
                f"camera {settings['cameraProtocol']}://{settings['cameraIp']}:{settings['cameraPort']}, "
                f"MQTT {settings['mqttBroker']}:{settings['mqttPort']}, "
                f"inference rate {settings['inferenceRate']} fps. "
                f"Initial setup has {camera_count} camera(s) and {mapping_count} mapping(s)."
            ),
        }

    if intent == "zones":
        return {
            "intent": intent,
            "reply": "This build uses left/right zones per camera based on bottom-center person point and adjustable divider.",
        }

    if intent == "restart":
        return {
            "intent": intent,
            "reply": "For safety, restart is manual-only. Use: docker compose restart ecoeye-app on the board shell.",
        }

    return {
        "intent": "help",
        "reply": "I can help with setup, status, and zone control. Try 'show status' or 'show setup'.",
    }


def add_dispatch_log(entry):
    with RUNTIME_LOCK:
        RUNTIME_STATE["dispatchLog"].append(entry)
        if len(RUNTIME_STATE["dispatchLog"]) > 200:
            RUNTIME_STATE["dispatchLog"] = RUNTIME_STATE["dispatchLog"][-200:]


def mqtt_on_connect(client, userdata, flags, reason_code, properties=None):
    with RUNTIME_LOCK:
        RUNTIME_STATE["mqttConnected"] = reason_code == 0


def mqtt_on_disconnect(client, userdata, disconnect_flags, reason_code, properties=None):
    with RUNTIME_LOCK:
        RUNTIME_STATE["mqttConnected"] = False


def ensure_mqtt_connected(control):
    global MQTT_CLIENT

    mqtt_cfg = control.get("mqtt", {})
    host = str(mqtt_cfg.get("host", "192.168.1.1"))
    port = int(mqtt_cfg.get("port", 1883))
    client_id = str(mqtt_cfg.get("clientId", "ecoeye-controller"))
    config_snapshot = {"host": host, "port": port, "clientId": client_id}

    with RUNTIME_LOCK:
        reuse = MQTT_CLIENT is not None and RUNTIME_STATE.get("mqttConfig") == config_snapshot

    if reuse:
        with RUNTIME_LOCK:
            return bool(RUNTIME_STATE.get("mqttConnected"))

    client = mqtt_client.Client(mqtt_client.CallbackAPIVersion.VERSION2, client_id=client_id)
    client.on_connect = mqtt_on_connect
    client.on_disconnect = mqtt_on_disconnect

    try:
        client.connect(host, port, keepalive=20)
        client.loop_start()
        time.sleep(0.2)
        with RUNTIME_LOCK:
            MQTT_CLIENT = client
            RUNTIME_STATE["mqttConfig"] = config_snapshot
            connected = bool(RUNTIME_STATE.get("mqttConnected"))
        return connected
    except Exception:
        with RUNTIME_LOCK:
            RUNTIME_STATE["mqttConnected"] = False
        return False


def parse_payload(raw_value, fallback=None):
    if isinstance(raw_value, dict):
        return raw_value
    if isinstance(raw_value, str):
        stripped = raw_value.strip()
        if stripped.startswith("{") and stripped.endswith("}"):
            try:
                return json.loads(stripped)
            except Exception:
                pass
    if fallback is not None:
        return fallback
    return {"command": str(raw_value)}


def build_device_payload(device, turn_on, setup_doc):
    control = setup_doc.get("control", {})
    ac_defaults = control.get("acDefaults", {})

    if turn_on:
        base_raw = device.get("onCommand", "ON")
        if device.get("kind") == "ac-ir" and isinstance(base_raw, str) and base_raw.strip().upper() == "ON":
            return {
                "power": "on",
                "mode": ac_defaults.get("mode", "cool"),
                "temp": ac_defaults.get("temp", 24),
                "fan": ac_defaults.get("fan", "auto"),
            }
        return parse_payload(base_raw, fallback={"power": "on"})

    base_raw = device.get("offCommand", "OFF")
    return parse_payload(base_raw, fallback={"power": "off"})


def dispatch_to_device(device, payload, setup_doc):
    control = setup_doc.get("control", {})
    retry_cfg = control.get("retry", {})
    attempts = max(1, int(retry_cfg.get("attempts", 3)))
    backoff_ms = max(100, int(retry_cfg.get("backoffMs", 500)))

    protocol = str(device.get("protocol", "mqtt"))
    target = str(device.get("target", "")).strip()

    if not target:
        return {"ok": False, "error": "device target is empty"}

    for idx in range(attempts):
        try:
            if protocol == "mqtt":
                if not ensure_mqtt_connected(control):
                    raise RuntimeError("mqtt broker not connected")
                qos = int(control.get("mqtt", {}).get("qos", 1))
                retain = bool(control.get("mqtt", {}).get("retain", False))
                body = json.dumps(payload)
                result = MQTT_CLIENT.publish(target, body, qos=qos, retain=retain)
                if result.rc != mqtt_client.MQTT_ERR_SUCCESS:
                    raise RuntimeError(f"mqtt publish rc={result.rc}")

            elif protocol in ["socket-udp", "socket-tcp"]:
                # Protocol: "socket-udp" or "socket-tcp"
                # Target: "ip:port"
                if ":" not in target:
                    raise ValueError("Target must be in ip:port format for socket protocols")
                
                host_ip, port_str = target.split(":", 1)
                host_port = int(port_str)
                
                # Handle payload: if it's a hex string (0x...), convert to bytes
                # Otherwise, if it's a dict, convert to json. If it's a string, use it.
                if isinstance(payload, str) and payload.startswith("0x"):
                    try:
                        # Strip 0x and decode
                        hex_data = payload[2:]
                        if len(hex_data) % 2 != 0:
                            hex_data = "0" + hex_data
                        data_to_send = bytes.fromhex(hex_data)
                    except ValueError:
                        data_to_send = payload.encode("utf-8")
                elif isinstance(payload, (dict, list)):
                    data_to_send = json.dumps(payload).encode("utf-8")
                else:
                    data_to_send = str(payload).encode("utf-8")

                if protocol == "socket-udp":
                    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                    sock.settimeout(1.5)
                    sock.sendto(data_to_send, (host_ip, host_port))
                    sock.close()
                else: # socket-tcp
                    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    sock.settimeout(2.0)
                    sock.connect((host_ip, host_port))
                    sock.sendall(data_to_send)
                    sock.close()

            else:
                response = requests.post(target, json=payload, timeout=2.5)
                if response.status_code >= 400:
                    raise RuntimeError(f"http status={response.status_code}")

            return {"ok": True, "attempt": idx + 1}
        except Exception as ex:
            if idx + 1 >= attempts:
                return {"ok": False, "attempt": idx + 1, "error": str(ex)}
            time.sleep((backoff_ms / 1000.0) * (idx + 1))

    return {"ok": False, "error": "unreachable"}


def apply_zone_event_to_runtime(setup_doc, camera_id, zones, camera_online=True):
    now = time.time()
    hold_seconds = max(1, int(setup_doc.get("control", {}).get("holdSeconds", 30)))
    auto_off = bool(setup_doc.get("autoTurnOffWhenEmpty", True))
    camera_fail_policy = str(setup_doc.get("control", {}).get("cameraFailPolicy", "fail-safe-off"))

    for zone in ["left", "right"]:
        key = f"{camera_id}:{zone}"
        input_occupied = bool(zones.get(zone, False)) if camera_online else False

        with RUNTIME_LOCK:
            item = RUNTIME_STATE["zoneState"].get(key, {"occupied": False, "lastSeen": 0.0, "updatedAt": now})

        if input_occupied:
            item["occupied"] = True
            item["lastSeen"] = now
        else:
            stale = now - float(item.get("lastSeen", 0.0)) >= hold_seconds
            if auto_off and stale:
                item["occupied"] = False
            if (not camera_online) and camera_fail_policy == "fail-safe-off" and stale:
                item["occupied"] = False

        item["updatedAt"] = now
        with RUNTIME_LOCK:
            RUNTIME_STATE["zoneState"][key] = item


def evaluate_and_dispatch(setup_doc):
    devices = setup_doc.get("devices", [])
    mappings = setup_doc.get("zoneMappings", [])

    actions = []

    for dev in devices:
        dev_id = dev.get("id")
        relevant = [m for m in mappings if m.get("deviceId") == dev_id]

        desired_on = False
        for mapping in relevant:
            zone_key = f"{mapping.get('cameraId')}:{mapping.get('zone')}"
            with RUNTIME_LOCK:
                zone_state = RUNTIME_STATE["zoneState"].get(zone_key, {"occupied": False})
            if bool(zone_state.get("occupied", False)):
                desired_on = True
                break

        with RUNTIME_LOCK:
            current_on = bool(RUNTIME_STATE["deviceState"].get(dev_id, False))

        if desired_on == current_on:
            continue

        payload = build_device_payload(dev, desired_on, setup_doc)
        result = dispatch_to_device(dev, payload, setup_doc)

        log_item = {
            "timestamp": int(time.time()),
            "deviceId": dev_id,
            "desiredOn": desired_on,
            "result": result,
            "protocol": dev.get("protocol"),
            "target": dev.get("target"),
            "payload": payload,
        }
        add_dispatch_log(log_item)

        if result.get("ok"):
            with RUNTIME_LOCK:
                RUNTIME_STATE["deviceState"][dev_id] = desired_on
            actions.append({"deviceId": dev_id, "state": "ON" if desired_on else "OFF", "ok": True})
        else:
            actions.append({"deviceId": dev_id, "state": "ON" if desired_on else "OFF", "ok": False, "error": result.get("error")})

    return actions


@app.route("/health", methods=["GET"])
def health_check():
    with RUNTIME_LOCK:
        mqtt_connected = bool(RUNTIME_STATE.get("mqttConnected", False))
    return jsonify({"status": "healthy", "service": "EcoEYE Application", "mqttConnected": mqtt_connected}), 200


@app.route("/api/status", methods=["GET"])
def status():
    setup_doc = load_setup()
    return jsonify(
        {
            "application": "EcoEYE",
            "version": APP_VERSION,
            "status": "running",
            "description": "Offline occupancy management and control system",
            "uptimeSeconds": int(time.time() - STARTED_AT),
            "setupCompleted": is_setup_complete(setup_doc),
        }
    ), 200


@app.route("/api/zones", methods=["GET"])
def get_zones():
    zones = [
        {"id": 1, "name": "Left", "area": (0.0, 0.0, 0.5, 1.0), "color": (255, 0, 0)},
        {"id": 2, "name": "Right", "area": (0.5, 0.0, 1.0, 1.0), "color": (0, 255, 0)},
    ]
    return jsonify({"zones": zones}), 200


@app.route("/api/auth/login", methods=["POST"])
def login():
    payload = request.get_json(silent=True) or {}
    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", ""))

    auth_doc = load_auth_doc()
    if username != auth_doc["username"]:
        return jsonify({"error": "Invalid username or password"}), 401

    computed_hash = hash_password(password, auth_doc["salt"])
    if not hmac.compare_digest(computed_hash, auth_doc["password_hash"]):
        return jsonify({"error": "Invalid username or password"}), 401

    setup_doc = load_setup()
    token = create_token(username)
    return (
        jsonify(
            {
                "token": token,
                "username": username,
                "mustChangePassword": bool(auth_doc.get("mustChangePassword", False)),
                "expiresInSeconds": TOKEN_TTL_SECONDS,
                "setupCompleted": is_setup_complete(setup_doc),
            }
        ),
        200,
    )


@app.route("/api/auth/me", methods=["GET"])
@require_auth
def me():
    setup_doc = load_setup()
    return jsonify({"username": request.user, "setupCompleted": is_setup_complete(setup_doc)}), 200


@app.route("/api/auth/change-password", methods=["POST"])
@require_auth
def change_password():
    payload = request.get_json(silent=True) or {}
    old_password = str(payload.get("oldPassword", ""))
    new_password = str(payload.get("newPassword", ""))

    if len(new_password) < 8:
        return jsonify({"error": "New password must be at least 8 characters"}), 400

    auth_doc = load_auth_doc()
    old_hash = hash_password(old_password, auth_doc["salt"])
    if not hmac.compare_digest(old_hash, auth_doc["password_hash"]):
        return jsonify({"error": "Current password is incorrect"}), 401

    new_salt = secrets.token_hex(16)
    auth_doc["salt"] = new_salt
    auth_doc["password_hash"] = hash_password(new_password, new_salt)
    auth_doc["mustChangePassword"] = False
    save_auth_doc(auth_doc)

    return jsonify({"status": "password-updated"}), 200


@app.route("/api/settings", methods=["GET"])
@require_auth
def get_settings():
    return jsonify({"settings": load_settings()}), 200


@app.route("/api/wifi/scan", methods=["GET"])
@require_auth
def wifi_scan():
    try:
        # Rescan first to get fresh results
        subprocess.run(["nmcli", "device", "wifi", "rescan"], capture_output=True, timeout=10)
        
        # Get the list
        result = subprocess.run(
            ["nmcli", "-t", "-f", "SSID,SIGNAL,SECURITY,BARS", "device", "wifi", "list"],
            capture_output=True, text=True, timeout=10
        )
        
        networks = []
        for line in result.stdout.strip().split("\n"):
            if not line: continue
            parts = line.split(":")
            if len(parts) >= 4:
                ssid = parts[0]
                if not ssid: continue # Skip hidden/empty SSIDs
                networks.append({
                    "ssid": ssid,
                    "signal": parts[1],
                    "security": parts[2],
                    "bars": parts[3]
                })
        
        # Deduplicate by SSID, keeping strongest signal
        deduped = {}
        for n in networks:
            if n["ssid"] not in deduped or int(n["signal"]) > int(deduped[n["ssid"]]["signal"]):
                deduped[n["ssid"]] = n
                
        return jsonify(list(deduped.values())), 200
    except Exception as ex:
        return jsonify({"error": str(ex)}), 500


@app.route("/api/wifi/connect", methods=["POST"])
@require_auth
def wifi_connect():
    payload = request.get_json(silent=True) or {}
    ssid = payload.get("ssid")
    password = payload.get("password")
    
    if not ssid:
        return jsonify({"error": "SSID is required"}), 400
        
    try:
        cmd = ["nmcli", "device", "wifi", "connect", ssid]
        if password:
            cmd.extend(["password", password])
            
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0:
            return jsonify({"status": "success", "message": f"Connected to {ssid}"}), 200
        else:
            return jsonify({"status": "error", "message": result.stderr or result.stdout}), 400
    except Exception as ex:
        return jsonify({"error": str(ex)}), 500

@app.route("/api/wifi/status", methods=["GET"])
@require_auth
def wifi_status():
    try:
        result = subprocess.run(["nmcli", "-t", "-f", "active,ssid", "dev", "wifi"], capture_output=True, text=True)
        for line in result.stdout.strip().split("\n"):
            if line.startswith("yes:"):
                return jsonify({"connected": True, "ssid": line.split(":")[1]}), 200
        return jsonify({"connected": False}), 200
    except Exception:
        return jsonify({"connected": False}), 200

@app.route("/api/settings", methods=["PUT"])
@require_auth
def update_settings():
    payload = request.get_json(silent=True) or {}
    provided = payload.get("settings")
    if not isinstance(provided, dict):
        return jsonify({"error": "Request must include a settings object"}), 400

    updated = dict(DEFAULT_SETTINGS)
    for key in DEFAULT_SETTINGS.keys():
        if key in provided:
            updated[key] = provided[key]

    save_settings(updated)
    return jsonify({"status": "saved", "settings": updated}), 200


@app.route("/api/chat", methods=["POST"])
@require_auth
def chat():
    payload = request.get_json(silent=True) or {}
    message = str(payload.get("message", "")).strip()
    if not message:
        return jsonify({"error": "Message is required"}), 400
    return jsonify(chatbot_reply(message)), 200


@app.route("/health", methods=["GET"])
def health_check():
    return jsonify({"status": "healthy", "time": time.time()}), 200


@app.route("/api/setup", methods=["GET"])
@require_auth
def get_setup():
    return jsonify({"setup": load_setup()}), 200


@app.route("/api/setup/status", methods=["GET"])
@require_auth
def get_setup_status():
    setup_doc = load_setup()
    return jsonify({"setupCompleted": is_setup_complete(setup_doc)}), 200


@app.route("/api/setup", methods=["PUT"])
@require_auth
def put_setup():
    payload = request.get_json(silent=True) or {}
    setup_doc = payload.get("setup")
    error = validate_setup(setup_doc)
    if error:
        return jsonify({"error": error}), 400

    normalized_devices = []
    for dev in setup_doc["devices"]:
        normalized = dict(dev)
        if not isinstance(normalized.get("meta"), dict):
            normalized["meta"] = {}
        normalized_devices.append(normalized)

    control = merge_control(setup_doc.get("control"))

    preserved = {
        "version": int(setup_doc.get("version", 2)),
        "autoTurnOffWhenEmpty": bool(setup_doc.get("autoTurnOffWhenEmpty", True)),
        "occupancyDecisionIntervalSec": float(setup_doc.get("occupancyDecisionIntervalSec", 1.0)),
        "cameras": setup_doc["cameras"],
        "devices": normalized_devices,
        "zoneMappings": setup_doc["zoneMappings"],
        "control": control,
    }

    preserved["control"]["setupCompleted"] = is_setup_complete(preserved)

    save_setup(preserved)
    return jsonify({"status": "saved", "setup": preserved, "setupCompleted": preserved["control"]["setupCompleted"]}), 200


@app.route("/api/setup/zone-from-basepoint", methods=["POST"])
@require_auth
def zone_from_basepoint():
    payload = request.get_json(silent=True) or {}
    camera_id = str(payload.get("cameraId", "")).strip()
    base_point_x = payload.get("basePointX")
    frame_width = payload.get("frameWidth")

    try:
        base_point_x = float(base_point_x)
        frame_width = float(frame_width)
    except Exception:
        return jsonify({"error": "basePointX and frameWidth must be numeric"}), 400

    if frame_width <= 0:
        return jsonify({"error": "frameWidth must be positive"}), 400

    setup_doc = load_setup()
    camera = next((cam for cam in setup_doc.get("cameras", []) if cam.get("id") == camera_id), None)
    if not camera:
        return jsonify({"error": "cameraId not found"}), 404

    divider_x = float(camera.get("dividerRatio", 0.5)) * frame_width
    zone = "left" if base_point_x < divider_x else "right"
    return jsonify({"zone": zone, "dividerX": divider_x}), 200


@app.route("/api/control/contract", methods=["GET"])
@require_auth
def control_contract():
    return jsonify(
        {
            "protocol": "MQTT per-device topic (primary), HTTP POST (optional)",
            "qos": 1,
            "retry": "3 attempts with linear backoff",
            "devicePayload": {
                "power": "on|off",
                "mode": "optional for AC",
                "temp": "optional for AC",
                "fan": "optional for AC",
            },
            "occupancyEventPayload": {
                "cameraId": "cam-1",
                "cameraOnline": True,
                "zones": {"left": True, "right": False},
            },
            "rule": "Device ON if any mapped zone occupied; OFF after hold seconds",
        }
    ), 200


@app.route("/api/control/occupancy-event", methods=["POST"])
@require_auth
def control_occupancy_event():
    payload = request.get_json(silent=True) or {}
    camera_id = str(payload.get("cameraId", "")).strip()
    zones = payload.get("zones") or {}
    camera_online = bool(payload.get("cameraOnline", True))

    if not camera_id:
        return jsonify({"error": "cameraId is required"}), 400
    if not isinstance(zones, dict):
        return jsonify({"error": "zones must be an object"}), 400

    setup_doc = load_setup()
    camera = next((cam for cam in setup_doc.get("cameras", []) if cam.get("id") == camera_id), None)
    if not camera:
        return jsonify({"error": "cameraId not found"}), 404

    apply_zone_event_to_runtime(setup_doc, camera_id, zones, camera_online=camera_online)
    actions = evaluate_and_dispatch(setup_doc)

    with RUNTIME_LOCK:
        runtime_snapshot = {
            "zoneState": dict(RUNTIME_STATE["zoneState"]),
            "deviceState": dict(RUNTIME_STATE["deviceState"]),
            "mqttConnected": bool(RUNTIME_STATE["mqttConnected"]),
        }

    return jsonify({"status": "processed", "actions": actions, "runtime": runtime_snapshot}), 200


@app.route("/api/control/runtime", methods=["GET"])
@require_auth
def control_runtime():
    with RUNTIME_LOCK:
        return jsonify(
            {
                "zoneState": RUNTIME_STATE["zoneState"],
                "deviceState": RUNTIME_STATE["deviceState"],
                "mqttConnected": RUNTIME_STATE["mqttConnected"],
                "dispatchLog": RUNTIME_STATE["dispatchLog"][-30:],
            }
        ), 200


@app.route("/api/devices/discovered", methods=["GET"])
@require_auth
def get_discovered_devices():
    now = time.time()
    with RUNTIME_LOCK:
        # Filter out devices not seen in the last 10 minutes
        fresh = {
            ip: data for ip, data in DISCOVERY_STATE["discoveredDevices"].items()
            if now - data["lastSeen"] < 600
        }
        DISCOVERY_STATE["discoveredDevices"] = fresh
        return jsonify({"devices": list(fresh.values())}), 200


@app.route("/api/camera/discovered", methods=["GET"])
@require_auth
def get_discovered_cameras():
    now = time.time()
    with RUNTIME_LOCK:
        # Filter out cameras not seen in the last 15 minutes
        fresh = {
            ip: data for ip, data in CAMERA_DISCOVERY_STATE["discoveredCameras"].items()
            if now - data["lastSeen"] < 900
        }
        CAMERA_DISCOVERY_STATE["discoveredCameras"] = fresh
        return jsonify({"cameras": list(fresh.values())}), 200


@app.route("/api/camera/video-feed", methods=["GET"])
def camera_video_feed():
    ensure_stream_runtime_started()
    return Response(generate_mjpeg_stream(), mimetype="multipart/x-mixed-replace; boundary=frame")


@app.route("/api/camera/zone-status", methods=["GET"])
def camera_zone_status():
    ensure_stream_runtime_started()

    with STREAM_LOCK:
        zone_status = dict(STREAM_STATE.get("zoneStatus", {}))
        camera_status = dict(STREAM_STATE.get("cameraStatus", {}))
        last_frame_at = float(STREAM_STATE.get("lastFrameAt", 0.0) or 0.0)
        runtime_error = str(STREAM_STATE.get("runtimeError", ""))

    return jsonify(
        {
            "zoneStatus": zone_status,
            "cameraStatus": camera_status,
            "lastFrameAt": last_frame_at,
            "runtimeError": runtime_error,
            "streamOnline": bool(last_frame_at > 0 and (time.time() - last_frame_at) < 3.0),
        }
    ), 200

@app.route("/api/camera/config", methods=["GET"])
def get_camera_config():
    config = load_camera_config()
    return jsonify(config), 200


@app.route("/api/camera/config", methods=["PUT"])
def update_camera_config():
    try:
        payload = request.get_json(silent=True) or {}

        error_msg = validate_camera_config(payload)
        if error_msg:
            return jsonify({"error": error_msg}), 400

        save_camera_config(payload)

        ecoeye_framed_yolo.CAMERA_COUNT = int(payload.get("cameraCount", 1))
        ecoeye_framed_yolo.CAMERA_SOURCES = list(payload.get("cameraSources", []))
        ecoeye_framed_yolo.SLOT_SECONDS = float(payload.get("slotSeconds", 1.0))
        ecoeye_framed_yolo.TILE_WIDTH = int(payload.get("tileWidth", 480))
        ecoeye_framed_yolo.TILE_HEIGHT = int(payload.get("tileHeight", 270))
        ecoeye_framed_yolo.DECISION_INTERVAL_SEC = float(payload.get("decisionIntervalSec", 1.0))
        ecoeye_framed_yolo.CONFIDENCE_THRESHOLD = float(payload.get("confidenceThreshold", 0.4))

        restart_stream_processor()

        return jsonify({"success": True, "config": payload}), 200
    except Exception as ex:
        return jsonify({"error": str(ex)}), 500


@app.route("/")
def serve_root():
    if FRONTEND_DIR.exists():
        return send_from_directory(FRONTEND_DIR, "index.html")
    return jsonify({"message": "EcoEYE API Server", "note": "Frontend build not available"}), 200


@app.route("/<path:path>")
def serve_frontend(path):
    if not FRONTEND_DIR.exists():
        return jsonify({"error": "Frontend not available"}), 404

    requested = FRONTEND_DIR / path
    if requested.exists() and requested.is_file():
        return send_from_directory(FRONTEND_DIR, path)

    return send_from_directory(FRONTEND_DIR, "index.html")


if __name__ == "__main__":
    ensure_data_files()
    bind_host = os.getenv("APP_BIND", "0.0.0.0")
    try:
        bind_port = int(os.getenv("APP_PORT", "80"))
    except (ValueError, TypeError):
        bind_port = 80

    print("=" * 60)
    print("EcoEYE Secure Offline Server Starting")
    print("=" * 60)
    print(f"Frontend dir: {FRONTEND_DIR}")
    print(f"Data dir: {DATA_DIR}")
    print(f"Bind: {bind_host}:{bind_port}")
    print("LAN access enabled. Use board-ip:published-port from same WiFi.")
    print("=" * 60)

    ensure_control_bridge_started()
    ensure_discovery_started()
    ensure_camera_discovery_started()
    app.run(host=bind_host, port=bind_port, debug=False)







