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

---

## Pager provisioning (ESP8266)

Kitchen alerts reach pagers over MQTT topics `kot/pager/{device_code}/notify`. Each pager must be on **restaurant Wi‑Fi** and provisioned once via the **ROOT** install network.

**Full step-by-step guide (ROOT → restaurant Wi‑Fi, daily behavior, factory reset):**

→ **[firmware/pager-esp8266/README.md](../firmware/pager-esp8266/README.md)**

### Short version

1. Flash `firmware/pager-esp8266/pager-esp8266.ino` with `ROOT_SSID` / `ROOT_PASS` matching your install router.
2. Laptop on ROOT → `npm run install:full` → open `/setup`.
3. Save restaurant SSID, password, and **MQTT host** (laptop IP on restaurant LAN, port `1883`).
4. Pager on ROOT shows **`on_root`** → **Push restaurant Wi-Fi**.
5. Pager joins restaurant Wi‑Fi → setup table shows **`mqtt_ok`** → assign waiter in Manager.
6. **pager-bridge** (started by `install:full`) forwards Supabase notifications to those MQTT topics.

### Reset a pager

- **Forget** on `/setup` only works when the pager is on ROOT (`on_root`).
- Otherwise: Arduino IDE **Erase All Flash** + re-upload firmware (see firmware README).

### MQTT topics (reference)

| Topic | Direction | Purpose |
|-------|-----------|---------|
| `kot/pager/{device_code}/notify` | Server → pager | Kitchen alerts (JSON) |
| `kot/pager/{device_code}/status` | Pager → server | `online` / LWT `offline` |
