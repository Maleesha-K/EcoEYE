import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from functools import wraps
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

APP_DIR = Path(__file__).parent
FRONTEND_DIR = APP_DIR / "frontend" / "dist"
DATA_DIR = APP_DIR / "data"
SETTINGS_FILE = DATA_DIR / "settings.json"
AUTH_FILE = DATA_DIR / "auth.json"
SETUP_FILE = DATA_DIR / "setup.json"

APP_VERSION = "2.0.0"
TOKEN_TTL_SECONDS = int(os.getenv("TOKEN_TTL_SECONDS", "28800"))
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
    "version": 1,
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
            "target": "esp32/lounge",
            "onCommand": "ON",
            "offCommand": "OFF",
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
}


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


def load_settings():
    ensure_data_files()
    settings = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
    merged = dict(DEFAULT_SETTINGS)
    merged.update(settings)
    return merged


def save_settings(settings_doc):
    SETTINGS_FILE.write_text(json.dumps(settings_doc, indent=2), encoding="utf-8")


def load_setup():
    ensure_data_files()
    existing = json.loads(SETUP_FILE.read_text(encoding="utf-8"))
    merged = dict(DEFAULT_SETUP)
    merged.update(existing)

    if not isinstance(merged.get("cameras"), list):
        merged["cameras"] = list(DEFAULT_SETUP["cameras"])
    if not isinstance(merged.get("devices"), list):
        merged["devices"] = list(DEFAULT_SETUP["devices"])
    if not isinstance(merged.get("zoneMappings"), list):
        merged["zoneMappings"] = list(DEFAULT_SETUP["zoneMappings"])

    return merged


def save_setup(setup_doc):
    SETUP_FILE.write_text(json.dumps(setup_doc, indent=2), encoding="utf-8")


def validate_setup(payload):
    if not isinstance(payload, dict):
        return "Setup payload must be an object"

    for key in ["cameras", "devices", "zoneMappings"]:
        if key not in payload or not isinstance(payload[key], list):
            return f"Setup must include a list: {key}"

    valid_source_types = {"rtsp", "http-mjpeg", "usb", "file"}
    valid_zones = {"left", "right"}
    valid_protocols = {"mqtt", "http"}

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
            return f"Mapping zone must be 'left' or 'right'"

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
                "Health checks are passing and LAN access is enabled."
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
                f"Initial setup has {camera_count} camera(s) and {mapping_count} zone mapping(s)."
            ),
        }

    if intent == "zones":
        return {
            "intent": intent,
            "reply": "Two zones are configured: Lounge and Workstations. Use the Zones screen for occupancy insights.",
        }

    if intent == "restart":
        return {
            "intent": intent,
            "reply": "For safety, restart is manual-only. Use: docker compose restart ecoeye-app on the board shell.",
        }

    return {
        "intent": "help",
        "reply": (
            "I can help with local operations: system status, zone summary, and settings guidance. "
            "Try: 'show status', 'camera settings', or 'how to restart service'."
        ),
    }


@app.route("/health", methods=["GET"])
def health_check():
    return jsonify({"status": "healthy", "service": "EcoEYE Application"}), 200


@app.route("/api/status", methods=["GET"])
def status():
    return jsonify(
        {
            "application": "EcoEYE",
            "version": APP_VERSION,
            "status": "running",
            "description": "Offline occupancy management and control system",
            "uptimeSeconds": int(time.time() - STARTED_AT),
        }
    ), 200


@app.route("/api/zones", methods=["GET"])
def get_zones():
    zones = [
        {"id": 1, "name": "Lounge", "area": (0.0, 0.0, 0.5, 1.0), "color": (255, 0, 0)},
        {"id": 2, "name": "Workstations", "area": (0.5, 0.0, 1.0, 1.0), "color": (0, 255, 0)},
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

    token = create_token(username)
    return (
        jsonify(
            {
                "token": token,
                "username": username,
                "mustChangePassword": bool(auth_doc.get("mustChangePassword", False)),
                "expiresInSeconds": TOKEN_TTL_SECONDS,
            }
        ),
        200,
    )


@app.route("/api/auth/me", methods=["GET"])
@require_auth
def me():
    return jsonify({"username": request.user}), 200


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


@app.route("/api/setup", methods=["GET"])
@require_auth
def get_setup():
    return jsonify({"setup": load_setup()}), 200


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

    preserved = {
        "version": int(setup_doc.get("version", 1)),
        "autoTurnOffWhenEmpty": bool(setup_doc.get("autoTurnOffWhenEmpty", True)),
        "occupancyDecisionIntervalSec": float(setup_doc.get("occupancyDecisionIntervalSec", 1.0)),
        "cameras": setup_doc["cameras"],
        "devices": normalized_devices,
        "zoneMappings": setup_doc["zoneMappings"],
    }

    save_setup(preserved)
    return jsonify({"status": "saved", "setup": preserved}), 200


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
    bind_port = int(os.getenv("APP_PORT", "5000"))

    print("=" * 60)
    print("EcoEYE Secure Offline Server Starting")
    print("=" * 60)
    print(f"Frontend dir: {FRONTEND_DIR}")
    print(f"Data dir: {DATA_DIR}")
    print(f"Bind: {bind_host}:{bind_port}")
    print("LAN access enabled. Use board-ip:published-port from same WiFi.")
    print("=" * 60)

    app.run(host=bind_host, port=bind_port, debug=False)
