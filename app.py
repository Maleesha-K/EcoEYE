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
        return {
            "intent": intent,
            "reply": (
                "Current key settings: "
                f"camera {settings['cameraProtocol']}://{settings['cameraIp']}:{settings['cameraPort']}, "
                f"MQTT {settings['mqttBroker']}:{settings['mqttPort']}, "
                f"inference rate {settings['inferenceRate']} fps."
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
