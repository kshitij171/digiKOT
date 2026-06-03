# pager-bridge

Node process that **polls** new `notifications` rows via Supabase RPC `fetch_notifications_after`, maps `target_user_id` → `pager_assignments` → `device_code`, and **publishes** JSON to MQTT `kot/pager/{device_code}/notify`. If the waiter has no pager, it **logs** `no_pager_for_waiter` and skips MQTT.

## Setup

```bash
cd pager-bridge
npm install
```

Copy env (use **service role** key — never ship this in the browser):

```bash
cp .env.example .env
# Edit .env: set SUPABASE_SERVICE_ROLE_KEY from `npx supabase status -o env` (SERVICE_ROLE_KEY=...)
# Set MQTT_URL to the LAN IP of the machine running Mosquitto (e.g. `ipconfig getifaddr en0` on macOS).
```

Or export manually:

```bash
export SUPABASE_URL="http://127.0.0.1:54321"
export SUPABASE_SERVICE_ROLE_KEY="<service_role from supabase status>"
# Use your Mosquitto host LAN IP so phones/ESP8266 on Wi‑Fi can reach the broker (not 127.0.0.1 from other devices).
export MQTT_URL="mqtt://192.168.29.167:1883"
# optional:
export POLL_MS=2000
export PAGER_BRIDGE_CURSOR="$PWD/.pager-bridge-cursor.json"
```

## Run

`npm start` loads `.env` via Node’s `--env-file`. From this directory:

```bash
npm start
```

## Cursor

First run uses a baseline timestamp (now) and `after_id` = max UUID so **historical** notifications are not replayed. After each processed batch, cursor is written to `.pager-bridge-cursor.json` (or `PAGER_BRIDGE_CURSOR`).

## Later upgrades

- Switch trigger from polling to Supabase Realtime on `notifications`.
- MQTT QoS / retries if you need stronger delivery guarantees.
