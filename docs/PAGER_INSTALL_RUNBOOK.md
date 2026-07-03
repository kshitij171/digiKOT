# Pager install runbook

Field guide for provisioning ESP8266 pagers at a restaurant using the digiKOT install setup UI.

## What you need

- Laptop with digiKOT repo and Node.js 20+
- **ROOT router** — SSID `DigiKOT-ROOT`, password `digikot-root` (or match factory settings in `firmware/pager-esp8266/pager-esp8266.ino`)
- Restaurant **2.4 GHz** Wi-Fi credentials
- ESP8266 pagers flashed with [`firmware/pager-esp8266`](../firmware/pager-esp8266) at the workplace

No Docker or external Mosquitto required — the digiKOT server embeds MQTT on port **1883**.

## Recommended laptop networking (dual-home)

Avoid a ROOT-bounce loop by keeping both networks reachable during install:

1. **Ethernet** → ROOT router LAN port (talks to ESPs on `192.168.50.x`)
2. **Wi-Fi** → restaurant network (MQTT host for pagers after push)

Pagers **UDP-discover** the laptop setup server on port `50505` (no need to match a hardcoded IP). `SETUP_API_BASE` in firmware is fallback only.

Note the laptop **restaurant-LAN IP** (e.g. `192.168.29.x`) — this is the **MQTT host** you enter in setup, **not** the ROOT IP.

## Before pagers arrive on ROOT

1. Copy `.env.example` → `.env.local` and set:
   - `SETUP_UI_PASSWORD` — installer password for `/setup`
2. Start the stack:
   ```bash
   npm run dev:all
   ```
   This runs the Fastify server (`:3000`, MQTT `:1883`, UDP discovery `:50505`) and Vite UI (`:5173`).

   For production-style single process:
   ```bash
   npm run build && npm run start
   ```
   Open `http://<laptop-lan-ip>:3000/setup`.

## Install steps

1. Power **ROOT router** and all ESPs (they join `DigiKOT-ROOT`).
2. Open **`http://<laptop-root-or-lan-ip>:5173/setup`** (dev) or **`:3000/setup`** (prod) and enter installer password.
3. **Restaurant network** form:
   - SSID + password
   - **Server / MQTT host** = laptop IP on **restaurant Wi-Fi**
   - Port `1883`
   - Click **Save config**
4. Confirm each OLED shows its **`device_code`** (from hello). Use **Test beep** per row to match physical units; relabel if needed.
5. Click **Push restaurant Wi-Fi to all on ROOT**.
6. Watch table: `push_pending` → `mqtt_ok` (pager status via embedded MQTT worker).
7. When all show **`mqtt_ok`**, open **Manager → Pagers** (`/manager`, PIN 4321) and assign waiters.

## State reference

| State | Meaning |
|-------|---------|
| `on_root` | ESP on ROOT LAN, polling setup API |
| `push_pending` | Wi-Fi config queued |
| `wifi_failed` | Restaurant Wi-Fi association failed; ESP back on ROOT |
| `on_restaurant_wifi` | Wi-Fi OK (rarely shown if MQTT connects quickly) |
| `mqtt_ok` | MQTT online (embedded broker + pager worker) |
| `offline` | MQTT LWT / disconnected |

## Discovery and firewall

- `npm run dev:all` or `npm run start` starts the UDP discovery responder (`setup discovery responder listening on udp/50505`).
- Test responder logic only: `npm run probe-discovery` (same Mac — **does not** prove macOS firewall allows external ESP traffic).
- **Real ESP on the LAN** is required to validate firewall — allow incoming for `node` in System Settings → Firewall.
- If the server is stopped, unprovisioned pagers cycle hello attempts then 8s rediscovery (expected retry behavior).

## Troubleshooting

- **OLED stuck "waiting…"** — discovery/hello failed; check firewall, same LAN, server running; Serial @ 115200 shows `setupApiBase=`.
- **No pagers in table** — ESPs not on ROOT, wrong ROOT SSID/password, or laptop not on ROOT LAN.
- **Stuck on `push_pending`** — ESP did not get command; check ROOT connectivity; avoid restarting server mid-push (re-save config and re-push).
- **Never `mqtt_ok`** — wrong MQTT host (ROOT IP instead of restaurant IP), server not running, or firewall blocking 1883.
- **Pagers bounce to ROOT after push** — firmware must not fall back on MQTT failure; re-flash universal firmware.
- **Server restart** — in-memory setup state clears; re-save restaurant Wi-Fi and push again.

## After install

- Staff use `/login` — not `/setup`.
- Setup UI password is for installers only; do not share with restaurant staff.
