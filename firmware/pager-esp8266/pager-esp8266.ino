/**
 * digiKOT ESP8266 pager — universal factory firmware.
 * ROOT provisioning via setup API; restaurant run mode via MQTT.
 *
 * Edit the factory settings below, then upload this sketch to every pager.
 */

// --- Factory settings (change before flashing all pagers) ---
#define ROOT_SSID "TP-Link_1B90"
#define ROOT_PASS "97265672"
#define SETUP_API_BASE "http://192.168.50.10:5173"

#define OLED_SDA_PIN 4   // D2
#define OLED_SCL_PIN 5   // D1
#define OLED_WIDTH 128
#define OLED_HEIGHT 64

#define WIFI_ASSOC_TIMEOUT_MS 15000
#define HELLO_INTERVAL_MS 3000
#define MQTT_RETRY_MS 5000
#define STATUS_HEARTBEAT_MS 15000
#define MQTT_BUFFER_SIZE 1024
#define ALERT_DISPLAY_MS 8000

#define CONFIG_PATH "/pager_config.json"
#define FW_VERSION "1.0.0"

#define DISCOVERY_PORT 50505
#define DISCOVERY_PROBE "DIGIKOT_DISCOVER v1"
#define DISCOVERY_REPLY_PREFIX "DIGIKOT_SERVER "
#define DISCOVERY_TIMEOUT_MS 8000
#define HELLO_FAIL_REDISCOVER 3

#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <WiFiClient.h>
#include <WiFiUdp.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

Adafruit_SSD1306 display(OLED_WIDTH, OLED_HEIGHT, &Wire, -1);
WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

struct PagerConfig {
  String restaurantSsid;
  String restaurantPass;
  String mqttHost;
  uint16_t mqttPort;
  String deviceCode;
  String pendingAckCommandId;
  bool provisioned;
};

PagerConfig cfg;
String g_setupApiBase;
String assignedCode = "";
String lastMac = "";
unsigned long lastHelloMs = 0;
unsigned long lastMqttRetryMs = 0;
unsigned long lastStatusMs = 0;
uint8_t g_helloFailCount = 0;
bool runMode = false;
unsigned long alertUntil = 0;

void oledClear() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
}

void oledLine(uint8_t row, const String &text, uint8_t size = 1) {
  display.setTextSize(size);
  display.setCursor(0, row * 10);
  display.println(text.substring(0, 21));
}

void drawSetupScreen(const String &code, const String &mac, const String &ip) {
  oledClear();
  oledLine(0, "SETUP", 2);
  if (code.length()) oledLine(2, code, 2);
  else oledLine(2, "waiting...", 1);
  oledLine(4, mac, 1);
  oledLine(5, ip, 1);
  display.display();
}

void drawRunScreen(const String &line1, const String &line2 = "") {
  oledClear();
  oledLine(0, cfg.deviceCode.length() ? cfg.deviceCode : "pager", 2);
  oledLine(3, line1, 1);
  if (line2.length()) oledLine(5, line2, 1);
  display.display();
}

void drawAlert(const String &title, const String &detail) {
  oledClear();
  oledLine(0, "ALERT", 2);
  oledLine(3, title, 1);
  oledLine(5, detail, 1);
  display.display();
}

void drawStatusMessage(const String &line1, const String &line2 = "") {
  oledClear();
  oledLine(1, line1, 1);
  if (line2.length()) oledLine(3, line2, 1);
  display.display();
}

IPAddress computeBroadcast(IPAddress ip, IPAddress mask) {
  IPAddress bcast;
  for (int i = 0; i < 4; i++) {
    bcast[i] = (uint8_t)(ip[i] | ((~mask[i]) & 0xFF));
  }
  return bcast;
}

IPAddress probeBroadcastTarget() {
  IPAddress ip = WiFi.localIP();
  if ((uint32_t)ip == 0) {
    return IPAddress(255, 255, 255, 255);
  }
  return computeBroadcast(ip, WiFi.subnetMask());
}

bool discoverSetupServer(uint32_t timeoutMs) {
  WiFiUDP udp;
  if (!udp.begin(DISCOVERY_PORT)) return false;

  IPAddress bcast = probeBroadcastTarget();
  unsigned long t0 = millis();
  unsigned long lastSend = 0;
  char buf[128];

  while (millis() - t0 < timeoutMs) {
    if (millis() - lastSend >= 1000) {
      lastSend = millis();
      udp.beginPacket(bcast, DISCOVERY_PORT);
      udp.write((const uint8_t *)DISCOVERY_PROBE, strlen(DISCOVERY_PROBE));
      udp.endPacket();
    }
    int pkt = udp.parsePacket();
    if (pkt > 0) {
      int n = udp.read(buf, sizeof(buf) - 1);
      if (n > 0) {
        buf[n] = '\0';
        String payload = String(buf);
        payload.trim();
        if (payload.startsWith(DISCOVERY_REPLY_PREFIX)) {
          g_setupApiBase = payload.substring(strlen(DISCOVERY_REPLY_PREFIX));
          g_setupApiBase.trim();
          udp.stop();
          return g_setupApiBase.length() > 0;
        }
      }
    }
    yield();
    delay(10);
  }
  udp.stop();
  return false;
}

void resolveSetupApiBaseAtBoot() {
  drawStatusMessage("Finding server...");
  if (discoverSetupServer(DISCOVERY_TIMEOUT_MS)) {
    String shortHost = g_setupApiBase;
    shortHost.replace("http://", "");
    drawStatusMessage("Found", shortHost);
    Serial.print("setupApiBase=");
    Serial.println(g_setupApiBase);
    delay(1200);
    return;
  }
  g_setupApiBase = SETUP_API_BASE;
  drawStatusMessage("Default server");
  Serial.print("setupApiBase=");
  Serial.println(g_setupApiBase);
  delay(800);
}

void maybeRediscoverAfterHelloFailure() {
  g_helloFailCount++;
  if (g_helloFailCount < HELLO_FAIL_REDISCOVER) return;
  g_helloFailCount = 0;
  drawStatusMessage("Re-discovering...");
  if (!discoverSetupServer(DISCOVERY_TIMEOUT_MS)) {
    g_setupApiBase = SETUP_API_BASE;
  }
  Serial.print("setupApiBase=");
  Serial.println(g_setupApiBase);
}

bool parseSetupHost(String &hostname, int &port) {
  String host = g_setupApiBase;
  host.replace("http://", "");
  host.replace("https://", "");
  int slash = host.indexOf('/');
  if (slash >= 0) host = host.substring(0, slash);
  port = 80;
  int colon = host.indexOf(':');
  if (colon >= 0) {
    hostname = host.substring(0, colon);
    port = host.substring(colon + 1).toInt();
  } else {
    hostname = host;
  }
  return hostname.length() > 0 && port > 0;
}

bool readHttpResponse(WiFiClient &client, String &bodyOut) {
  bodyOut = "";
  String statusLine = client.readStringUntil('\n');
  if (statusLine.length() == 0) return false;
  int sp1 = statusLine.indexOf(' ');
  int sp2 = statusLine.indexOf(' ', sp1 + 1);
  if (sp1 < 0 || sp2 < 0) return false;
  int status = statusLine.substring(sp1 + 1, sp2).toInt();
  if (status < 200 || status >= 300) return false;

  while (client.connected() || client.available()) {
    String line = client.readStringUntil('\n');
    if (line == "\r" || line.length() <= 1) break;
  }
  bodyOut = client.readString();
  return true;
}

bool setupHttpRequest(const char *method, const String &path, const String &jsonBody, String &bodyOut) {
  bodyOut = "";
  String hostname;
  int port = 80;
  if (!parseSetupHost(hostname, port)) return false;

  WiFiClient client;
  if (!client.connect(hostname.c_str(), port)) return false;

  if (strcmp(method, "POST") == 0) {
    client.print(String("POST ") + path + " HTTP/1.1\r\n");
    client.print(String("Host: ") + hostname + "\r\n");
    client.print("Content-Type: application/json\r\n");
    client.print(String("Content-Length: ") + jsonBody.length() + "\r\n");
    client.print("Connection: close\r\n\r\n");
    client.print(jsonBody);
  } else {
    client.print(String("GET ") + path + " HTTP/1.1\r\n");
    client.print(String("Host: ") + hostname + "\r\n");
    client.print("Connection: close\r\n\r\n");
  }

  unsigned long t0 = millis();
  while (!client.available() && client.connected() && millis() - t0 < 8000) {
    yield();
  }
  if (!client.available()) {
    client.stop();
    return false;
  }
  bool ok = readHttpResponse(client, bodyOut);
  client.stop();
  return ok;
}

bool loadConfig() {
  if (!LittleFS.exists(CONFIG_PATH)) return false;
  File f = LittleFS.open(CONFIG_PATH, "r");
  if (!f) return false;
  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, f)) {
    f.close();
    return false;
  }
  f.close();
  cfg.restaurantSsid = doc["restaurant_ssid"] | "";
  cfg.restaurantPass = doc["restaurant_pass"] | "";
  cfg.mqttHost = doc["mqtt_host"] | "";
  cfg.mqttPort = doc["mqtt_port"] | 1883;
  cfg.deviceCode = doc["device_code"] | "";
  cfg.pendingAckCommandId = doc["pending_ack_command_id"] | "";
  cfg.provisioned = doc["provisioned"] | false;
  return cfg.provisioned && cfg.restaurantSsid.length() > 0;
}

bool saveConfig() {
  StaticJsonDocument<512> doc;
  doc["restaurant_ssid"] = cfg.restaurantSsid;
  doc["restaurant_pass"] = cfg.restaurantPass;
  doc["mqtt_host"] = cfg.mqttHost;
  doc["mqtt_port"] = cfg.mqttPort;
  doc["device_code"] = cfg.deviceCode;
  doc["pending_ack_command_id"] = cfg.pendingAckCommandId;
  doc["provisioned"] = cfg.provisioned;
  File f = LittleFS.open(CONFIG_PATH, "w");
  if (!f) return false;
  serializeJson(doc, f);
  f.close();
  return true;
}

void clearConfig() {
  cfg = PagerConfig();
  if (LittleFS.exists(CONFIG_PATH)) LittleFS.remove(CONFIG_PATH);
}

String macString() {
  return WiFi.macAddress();
}

bool httpPostJson(const String &path, const String &jsonBody, String &bodyOut) {
  return setupHttpRequest("POST", path, jsonBody, bodyOut);
}

bool httpGet(const String &path, String &bodyOut) {
  return setupHttpRequest("GET", path, "", bodyOut);
}

void postAck(const String &commandId, const String &result) {
  StaticJsonDocument<256> doc;
  doc["mac"] = macString();
  doc["command_id"] = commandId;
  doc["result"] = result;
  doc["ip"] = WiFi.localIP().toString();
  String body;
  serializeJson(doc, body);
  String resp;
  httpPostJson("/api/setup/ack", body, resp);
}

void doHello() {
  StaticJsonDocument<256> doc;
  doc["mac"] = macString();
  doc["ip"] = WiFi.localIP().toString();
  doc["fw"] = FW_VERSION;
  doc["state"] = "on_root";
  String body;
  serializeJson(doc, body);
  String resp;
  if (!httpPostJson("/api/setup/hello", body, resp)) {
    maybeRediscoverAfterHelloFailure();
    return;
  }
  g_helloFailCount = 0;
  StaticJsonDocument<256> out;
  if (deserializeJson(out, resp)) return;
  if (out.containsKey("device_code")) {
    assignedCode = out["device_code"].as<String>();
    if (!cfg.deviceCode.length()) cfg.deviceCode = assignedCode;
  }
  drawSetupScreen(assignedCode, macString(), WiFi.localIP().toString());
}

void handleCommand(const JsonObject &cmd) {
  String type = cmd["type"] | "";
  String id = cmd["id"] | "";
  JsonObject payload = cmd["payload"];

  if (type == "TEST_BEEP") {
    drawAlert("TEST", "BEEP");
    delay(800);
    drawSetupScreen(assignedCode, macString(), WiFi.localIP().toString());
    return;
  }

  if (type == "FORGET_WIFI") {
    clearConfig();
    postAck(id, "forgot");
    delay(500);
    ESP.restart();
    return;
  }

  if (type == "APPLY_WIFI") {
    cfg.restaurantSsid = payload["ssid"] | "";
    cfg.restaurantPass = payload["password"] | "";
    cfg.mqttHost = payload["mqtt_host"] | "";
    cfg.mqttPort = payload["mqtt_port"] | 1883;
    cfg.deviceCode = payload["device_code"] | assignedCode;
    cfg.pendingAckCommandId = id;
    cfg.provisioned = true;
    if (saveConfig()) {
      delay(300);
      ESP.restart();
    } else {
      postAck(id, "wifi_failed");
    }
    return;
  }

  if (type == "REBOOT") {
    ESP.restart();
  }
}

void pollCommand() {
  String path = String("/api/setup/command?mac=") + macString();
  String resp;
  if (!httpGet(path, resp) || resp == "{}") return;
  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, resp)) return;
  if (!doc.containsKey("type")) return;
  handleCommand(doc.as<JsonObject>());
}

bool connectRootWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(ROOT_SSID, ROOT_PASS);
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < WIFI_ASSOC_TIMEOUT_MS) {
    delay(250);
    yield();
  }
  return WiFi.status() == WL_CONNECTED;
}

bool connectRestaurantWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(cfg.restaurantSsid.c_str(), cfg.restaurantPass.c_str());
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < WIFI_ASSOC_TIMEOUT_MS) {
    delay(250);
    yield();
  }
  return WiFi.status() == WL_CONNECTED;
}

int parseTableNumber(JsonVariantConst v) {
  if (v.is<int>()) return v.as<int>();
  if (v.is<const char *>()) return atoi(v.as<const char *>());
  return 0;
}

String friendlyEventDetail(const String &eventType) {
  if (eventType == "item_ready") return "ITEM READY";
  if (eventType == "item_out_of_stock") return "OUT OF STOCK";
  if (eventType == "cancel_approved") return "CANCEL OK";
  if (eventType == "cancel_rejected") return "CANCEL NO";
  if (eventType.length() == 0) return "KOT UPDATE";
  String s = eventType;
  s.replace('_', ' ');
  return s;
}

void showNotifyAlert(const String &eventType, int tableNum) {
  String line1;
  String line2;
  if (tableNum > 0) {
    line1 = String("TABLE ") + String(tableNum);
    line2 = friendlyEventDetail(eventType);
  } else {
    line1 = "ALERT";
    line2 = friendlyEventDetail(eventType);
  }
  drawAlert(line1, line2);
  alertUntil = millis() + ALERT_DISPLAY_MS;
}

void mqttCallback(char *topic, byte *payload, unsigned int length) {
  StaticJsonDocument<1024> doc;
  if (deserializeJson(doc, payload, length)) return;
  String eventType = doc["event_type"] | "notify";
  int tableNum = parseTableNumber(doc["table_number"]);
  showNotifyAlert(eventType, tableNum);
}

String buildStatusPayload(const char *status) {
  StaticJsonDocument<128> doc;
  doc["status"] = status;
  doc["ip"] = WiFi.localIP().toString();
  doc["fw"] = FW_VERSION;
  String out;
  serializeJson(doc, out);
  return out;
}

void publishMqttStatus(bool retained) {
  String statusTopic = String("kot/pager/") + cfg.deviceCode + "/status";
  String payload = buildStatusPayload("online");
  mqtt.publish(statusTopic.c_str(), payload.c_str(), retained);
  lastStatusMs = millis();
}

bool ensureMqtt() {
  if (!cfg.mqttHost.length()) return false;
  mqtt.setServer(cfg.mqttHost.c_str(), cfg.mqttPort);
  mqtt.setCallback(mqttCallback);
  mqtt.setBufferSize(MQTT_BUFFER_SIZE);
  String clientId = String("pager-") + cfg.deviceCode;
  String statusTopic = String("kot/pager/") + cfg.deviceCode + "/status";
  String notifyTopic = String("kot/pager/") + cfg.deviceCode + "/notify";

  if (mqtt.connected()) return true;

  if (millis() - lastMqttRetryMs < MQTT_RETRY_MS) return false;
  lastMqttRetryMs = millis();

  String lwt = buildStatusPayload("offline");
  mqtt.connect(clientId.c_str(), statusTopic.c_str(), 0, true, lwt.c_str());
  if (!mqtt.connected()) return false;

  publishMqttStatus(true);
  mqtt.subscribe(notifyTopic.c_str());
  drawRunScreen("MQTT OK", WiFi.localIP().toString());
  return true;
}

void rootLoop() {
  if (millis() - lastHelloMs >= HELLO_INTERVAL_MS) {
    lastHelloMs = millis();
    doHello();
  }
  pollCommand();
  delay(50);
}

void runLoop() {
  if (!ensureMqtt()) {
    drawRunScreen("WiFi OK", "MQTT retry...");
  } else if (millis() - lastStatusMs >= STATUS_HEARTBEAT_MS) {
    publishMqttStatus(true);
  }
  mqtt.loop();

  if (alertUntil && millis() > alertUntil) {
    alertUntil = 0;
    drawRunScreen("MQTT OK", WiFi.localIP().toString());
  }

  delay(10);
}

void setup() {
  Serial.begin(115200);
  Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    for (;;) delay(1000);
  }
  oledClear();
  display.display();

  if (!LittleFS.begin()) {
    LittleFS.format();
    LittleFS.begin();
  }

  bool hasConfig = loadConfig();

  if (hasConfig) {
    drawRunScreen("Joining WiFi...");
    if (connectRestaurantWifi()) {
      cfg.pendingAckCommandId = "";
      saveConfig();
      runMode = true;
      drawRunScreen("WiFi OK", "MQTT...");
      return;
    }
    // Wi-Fi association failed — fall back to ROOT and report error.
    assignedCode = cfg.deviceCode;
  }

  if (!connectRootWifi()) {
    drawSetupScreen("NO ROOT", macString(), "");
    for (;;) delay(1000);
  }

  lastMac = macString();
  resolveSetupApiBaseAtBoot();
  drawSetupScreen(assignedCode.length() ? assignedCode : cfg.deviceCode, lastMac, WiFi.localIP().toString());
  doHello();
  lastHelloMs = millis();

  if (cfg.pendingAckCommandId.length()) {
    postAck(cfg.pendingAckCommandId, "wifi_failed");
    cfg.pendingAckCommandId = "";
    saveConfig();
  }
}

void loop() {
  if (runMode) runLoop();
  else rootLoop();
}
