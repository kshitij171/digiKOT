/**
 * Stub sketch — replace WIFI_* and subscribe to kot/v1/default/kitchen/events.
 * Use PubSubClient + WiFi; parse JSON for kind == "test_notification".
 */
void setup() {
  Serial.begin(115200);
  Serial.println("esp32-notifier: add WiFi + MQTT (see ../README.md)");
}

void loop() {
  delay(5000);
  Serial.println("heartbeat (stub)");
}
