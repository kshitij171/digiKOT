# ESP32 firmware (MQTT)

Browser UIs use **HTTP + Socket.IO** to the Node server. Devices use **MQTT only** to Mosquitto.

## Broker (dev)

- Host: your LAN `SERVER_IP`, port **1883**
- TLS: not in the default compose profile (add later).
- Auth: **required** from day one. Example users from the default Mosquitto image build:
  - `kot_server` — publisher (server only)
  - `esp_waiter_1` — sample device subscriber (see `local-first/mosquitto/acl`)

## Topic contract (v1)

All topics are prefixed with `kot/v1/{restaurantId}/...`. Default `restaurantId` in dev is `default`.

| Topic pattern | Direction | Purpose |
|---------------|-----------|---------|
| `kot/v1/{rid}/kitchen/events` | server → devices | Kitchen-wide events (includes **test_notification** during bring-up) |
| `kot/v1/{rid}/waiter/{waiterId}/events` | server → devices | Waiter-targeted |
| `kot/v1/{rid}/table/{tableNumber}/events` | server → devices | Table-targeted |
| `kot/v1/{rid}/device/{deviceId}/status` | device → server | Heartbeat / RSSI (ingest via future bridge) |
| `kot/v1/{rid}/device/{deviceId}/ack` | device → server | User ack on device |

`deviceId` in topics is the **string** `devices.device_id` (e.g. `esp-waiter-1`), not the DB UUID.

## Test payload (kitchen)

After `POST /api/devices/test-notification`, the worker publishes JSON like:

```json
{
  "v": 1,
  "kind": "test_notification",
  "restaurantId": "default",
  "deviceId": "esp-waiter-1",
  "deviceDbId": "d_esp_waiter_1",
  "title": "Test",
  "message": "Server test notification (MQTT)",
  "at": "2026-05-01T12:00:00.000Z"
}
```

Firmware should **subscribe** to `kot/v1/default/kitchen/events` (or a narrower wildcard allowed by ACL), **parse** `v === 1`, and on `kind === 'test_notification'` **beep + show** `message`.

## Project layout

- `esp32-notifier/` — Arduino-IDE–friendly sketch stub (extend with PubSubClient or AsyncMQTT).
