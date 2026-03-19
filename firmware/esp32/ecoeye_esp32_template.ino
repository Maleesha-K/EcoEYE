/*
  EcoEYE ESP32 Firmware Template (MQTT + JSON)

  Features:
  - WiFi connect/reconnect
  - MQTT connect/reconnect
  - Subscribes to per-device command topic
  - Parses JSON payloads:
      {"power":"on"}
      {"power":"off"}
      {"power":"on","mode":"cool","temp":24,"fan":"auto"}
  - Controls a relay output (example for light/switch)
  - Placeholder hook for AC IR command handling

  Libraries (Arduino Library Manager):
  - PubSubClient
  - ArduinoJson
*/

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ===== USER CONFIG =====
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";

const char* MQTT_HOST = "192.168.1.2";
const uint16_t MQTT_PORT = 1883;

// Unique identifiers per board/device
const char* DEVICE_ID = "light-1";
const char* CMD_TOPIC = "esp32/room1/light1/cmd";
const char* STATE_TOPIC = "esp32/light-1/state";

// Output pin (adjust for your relay board)
const int RELAY_PIN = 2;

// If true, relay HIGH means ON. Set false if your board is active-LOW.
bool RELAY_ACTIVE_HIGH = true;

// ===== INTERNAL STATE =====
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

bool currentPowerOn = false;
String currentMode = "cool";
int currentTemp = 24;
String currentFan = "auto";

unsigned long lastReconnectAttemptMs = 0;
const unsigned long RECONNECT_INTERVAL_MS = 3000;

void setRelayPower(bool on) {
  currentPowerOn = on;
  int level = LOW;
  if (RELAY_ACTIVE_HIGH) {
    level = on ? HIGH : LOW;
  } else {
    level = on ? LOW : HIGH;
  }
  digitalWrite(RELAY_PIN, level);
}

void publishState(const char* reason) {
  StaticJsonDocument<256> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["online"] = true;
  doc["power"] = currentPowerOn ? "on" : "off";
  doc["mode"] = currentMode;
  doc["temp"] = currentTemp;
  doc["fan"] = currentFan;
  doc["reason"] = reason;
  doc["tsMs"] = millis();

  char buffer[256];
  size_t len = serializeJson(doc, buffer);
  mqttClient.publish(STATE_TOPIC, buffer, len);
}

void applyAcCommand(const String& mode, int temp, const String& fan, bool powerOn) {
  // TODO: Integrate your IR library here.
  // Example placeholders:
  // - irAc.setMode(mode)
  // - irAc.setTemp(temp)
  // - irAc.setFan(fan)
  // - irAc.setPower(powerOn)
  // - irAc.send()

  currentMode = mode;
  currentTemp = temp;
  currentFan = fan;
}

void handleCommandPayload(const char* payload, size_t length) {
  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, payload, length);
  if (err) {
    Serial.print("JSON parse error: ");
    Serial.println(err.c_str());
    return;
  }

  if (!doc.containsKey("power")) {
    Serial.println("Ignoring command without 'power'");
    return;
  }

  const char* power = doc["power"];
  bool turnOn = String(power).equalsIgnoreCase("on");

  // Optional AC keys
  String mode = doc["mode"] | currentMode;
  int temp = doc["temp"] | currentTemp;
  String fan = doc["fan"] | currentFan;

  // For light/switch behavior, relay control is enough.
  // For AC IR, keep relay optional and use IR command path.
  setRelayPower(turnOn);

  // AC hook: call only if your device is AC IR type.
  applyAcCommand(mode, temp, fan, turnOn);

  Serial.print("Applied power=");
  Serial.print(turnOn ? "on" : "off");
  Serial.print(" mode=");
  Serial.print(mode);
  Serial.print(" temp=");
  Serial.print(temp);
  Serial.print(" fan=");
  Serial.println(fan);

  publishState("command-applied");
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.print("MQTT message on topic: ");
  Serial.println(topic);

  String data;
  data.reserve(length + 1);
  for (unsigned int i = 0; i < length; i++) {
    data += static_cast<char>(payload[i]);
  }

  handleCommandPayload(data.c_str(), data.length());
}

void ensureWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  Serial.print("Connecting WiFi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
    if (millis() - start > 20000) {
      Serial.println("\nWiFi timeout. Will retry.");
      return;
    }
  }

  Serial.println("\nWiFi connected");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());
}

void ensureMqtt() {
  if (mqttClient.connected()) {
    return;
  }

  unsigned long now = millis();
  if (now - lastReconnectAttemptMs < RECONNECT_INTERVAL_MS) {
    return;
  }
  lastReconnectAttemptMs = now;

  Serial.println("Connecting MQTT...");
  String clientId = String("ecoeye-") + DEVICE_ID;

  if (mqttClient.connect(clientId.c_str())) {
    Serial.println("MQTT connected");
    mqttClient.subscribe(CMD_TOPIC, 1); // QoS 1
    publishState("mqtt-connected");
  } else {
    Serial.print("MQTT connect failed, rc=");
    Serial.println(mqttClient.state());
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);

  pinMode(RELAY_PIN, OUTPUT);
  setRelayPower(false);

  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);

  ensureWiFi();
  ensureMqtt();
}

void loop() {
  ensureWiFi();
  ensureMqtt();
  mqttClient.loop();

  // Keep loop responsive
  delay(10);
}
