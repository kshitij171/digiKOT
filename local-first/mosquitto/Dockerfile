FROM eclipse-mosquitto:2

ARG MQTT_SERVER_PASS=kot_dev_pass
ARG MQTT_ESP_PASS=esp_dev_pass

RUN mosquitto_passwd -b -c /mosquitto/config/passwd kot_server "${MQTT_SERVER_PASS}" \
  && mosquitto_passwd -b /mosquitto/config/passwd esp_waiter_1 "${MQTT_ESP_PASS}"
