# digiKOT ESP8266 Pager — Setup Guide

Simple guide to connect a new pager to the **ROOT** router (install day), then move it to the **restaurant Wi‑Fi** (daily use).

---

## Big picture

Every pager goes through **two Wi‑Fi networks**:

| Phase | Wi‑Fi | Who sets it | Purpose |
|-------|--------|-------------|---------|
| **1. ROOT** | Install router (e.g. `DigiKOT-ROOT`) | Hardcoded in firmware | Register pager, push restaurant credentials |
| **2. Restaurant** | Restaurant LAN (2.4 GHz) | Setup web page → **Push** | Daily use: MQTT alerts to kitchen |

```text
Factory / install day                    Daily operation
─────────────────────                    ─────────────────
[ROOT router] ──► [Laptop + /setup]      [Restaurant Wi‑Fi] ──► [Laptop MQTT]
       │                    │                      │
       └── ESP (pager) ─────┘                      └── ESP (pager)
```

**Restaurant Wi‑Fi is never typed into the firmware.** It is saved on the setup page and **pushed** to the pager while it is on ROOT.

---

## What you need

- **NodeMCU (ESP8266)** with OLED (SDA=D2, SCL=D1, 3.3V)
- **ROOT router** — spare router, 2.4 GHz, no internet required
- **Restaurant router** — 2.4 GHz SSID the pager will use every day
- **Install laptop** — digiKOT repo, Docker, Node.js
- **Same firmware** flashed on every pager (`pager-esp8266.ino`)

---

## One-time: flash firmware (factory)

1. Open `pager-esp8266.ino` in Arduino IDE.
2. Set **ROOT** credentials at the top (must match your install router):

   ```cpp
   #define ROOT_SSID "DigiKOT-ROOT"    // your ROOT router SSID
   #define ROOT_PASS "digikot-root"    // your ROOT router password
   ```

3. Board: **NodeMCU 1.0 (ESP-12E)** · Flash: **4MB (FS:1MB OTA:~1019KB)**
4. Libraries: PubSubClient, ArduinoJson, Adafruit SSD1306, Adafruit GFX
5. Upload sketch to the ESP.

> Uploading the sketch **does not** erase restaurant Wi‑Fi saved earlier. See [Reset pager to factory](#reset-pager-to-factory-new-esp-behavior) below.

---

## One-time: prepare install laptop

1. Copy `.env.example` → `.env.local` (set `SETUP_UI_PASSWORD`, Supabase keys).
2. Start Docker Desktop.
3. From repo root:

   ```bash
   npm run install:full
   ```

4. Note the **LAN UI** line (e.g. `http://192.168.1.105:5173`) — open **`/setup`** and enter the installer password.

**MQTT host for the setup form** = laptop IP on **restaurant Wi‑Fi** (not ROOT IP), port **1883**.

---

## Step-by-step: connect a new pager

### Phase 1 — ROOT (pager + laptop on install router)

| Step | Action | What you should see |
|------|--------|---------------------|
| 1 | Power **ROOT router** and pager | — |
| 2 | Connect **laptop Wi‑Fi** to ROOT (same SSID as `ROOT_SSID` in firmware) | Mac IP like `192.168.1.x` |
| 3 | Run `npm run install:full` (Docker on) | `setup discovery responder listening on udp/50505`, `VITE ready` |
| 4 | Power pager near ROOT router | OLED: **SETUP** → then **device code** (e.g. `pager1`), MAC, IP |
| 5 | Open `http://<laptop-ip>:5173/setup` | Login with installer password |
| 6 | **Restaurant network** form: SSID, password, **MQTT host** (laptop IP on restaurant Wi‑Fi), port `1883` | Click **Save config** |
| 7 | Table shows pager: state **`on_root`**, header **1 on ROOT** | Click **Refresh** if needed |
| 8 | Optional: **Test beep** | Pager beeps |
| 9 | Click **Push restaurant Wi-Fi to all on ROOT** | Pager reboots (~30 s) |

**Phase 1 done** when Push succeeds with no error.

---

### Phase 2 — Restaurant Wi‑Fi (pager leaves ROOT)

| Step | Action | What you should see |
|------|--------|---------------------|
| 10 | Pager joins **restaurant Wi‑Fi** (credentials from Push) | OLED: **WiFi OK** → **MQTT OK** |
| 11 | Laptop on **restaurant Wi‑Fi** (same network as pager) | `install:full` still running |
| 12 | Open `/setup` → **Refresh** | State **`mqtt_ok`**, header **1 mqtt_ok** |
| 13 | Manager → **Pagers** (`/login`, PIN 4321) | Assign pager to waiter |

**ROOT router can be powered off** after install. Pagers only need restaurant Wi‑Fi day to day.

---

## How the pager works after install

| Item | Behavior |
|------|----------|
| **Wi‑Fi** | Connects to restaurant SSID saved in flash (`/pager_config.json`) |
| **MQTT** | Connects to `mqtt_host:1883` from that same config |
| **Status** | Publishes `online` every 15s on `kot/pager/{device_code}/status` |
| **Alerts** | Subscribes to `kot/pager/{device_code}/notify` — shows **TABLE n** + **ITEM READY** (8s), then idle screen |
| **If restaurant Wi‑Fi fails** | Falls back to ROOT and shows **SETUP** (can re-push from `/setup`) |
| **If MQTT fails** | Stays on restaurant Wi‑Fi, retries MQTT (does **not** return to ROOT) |

**pager-bridge** on the laptop reads Supabase notifications and publishes to `kot/pager/{device_code}/notify`.

---

## Reset pager to factory (new-ESP behavior)

Saved restaurant Wi‑Fi lives in **LittleFS flash**, not in the `.ino` file. Re-uploading the sketch **keeps** that config unless you clear it.

### Method A — Setup page **Forget** (when pager is on ROOT)

Works only if the pager is in **ROOT mode** and can reach the laptop:

1. Laptop on **ROOT** Wi‑Fi, `npm run install:full` running.
2. Pager on ROOT — OLED **SETUP** + IP, table state **`on_root`**.
3. `/setup` → **Forget** on that row.
4. Pager reboots, clears config, shows **SETUP** / **waiting…**.

> **Forget does not work** if the pager is on restaurant Wi‑Fi (MQTT run mode). It never polls the setup API then.

### Method B — Erase flash in Arduino IDE (full wipe)

1. **Tools → Erase Flash → All Flash Contents** (or “Sketch + WiFi + FS”).
2. Upload `pager-esp8266.ino` again.
3. Power-cycle.

Pager behaves like **brand new**: joins ROOT only, no Jio/restaurant config.

### Method C — No Jio/restaurant signal

Power pager near **ROOT only** (restaurant router off or out of range). If saved Wi‑Fi join **fails**, firmware falls back to ROOT automatically. Then use **Forget** or **Push** again from `/setup`.

---

## OLED quick reference

| Screen | Meaning |
|--------|---------|
| **SETUP** + **waiting…** | On ROOT, looking for install laptop |
| **SETUP** + **pager1** + IP | Registered, ready for Push |
| **NO ROOT** | Wrong ROOT SSID/password or router off |
| **Joining WiFi…** | Run mode boot, joining restaurant |
| **MQTT OK** + IP | Provisioned and connected |
| **ALERT / TABLE n / ITEM READY** | Kitchen notification (clears after ~8s) |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Stuck **waiting…** | Laptop on same ROOT Wi‑Fi; `install:full` running; allow **node** in macOS Firewall |
| **0 on ROOT** in setup | Same as above |
| **Forget** does nothing | Pager on restaurant Wi‑Fi — use [Method B](#method-b--erase-flash-in-arduino-ide-full-wipe) |
| **mqtt_ok** never appears | Laptop on restaurant Wi‑Fi; MQTT host = laptop **restaurant** IP; Docker/Mosquitto running |
| Alert on laptop, frozen OLED | Reflash firmware with `mqtt.setBufferSize(1024)` (included in current sketch) |
| Pager rejoins Jio after reflash | LittleFS not cleared — erase flash (Method B) |

---

## Wiring

| OLED | NodeMCU |
|------|---------|
| SDA | D2 (GPIO4) |
| SCL | D1 (GPIO5) |
| VCC | 3.3V |
| GND | GND |

Serial debug: **115200** baud — prints `setupApiBase=` after UDP discovery on ROOT.

---

## Technical notes

- **UDP discovery** — port `50505`; probe `DIGIKOT_DISCOVER v1`; laptop replies with setup URL. `SETUP_API_BASE` in firmware is fallback only.
- **Device codes** — auto-assigned on first hello (`pager1`, `pager2`, …).
- **Full field runbook** — [docs/PAGER_INSTALL_RUNBOOK.md](../../docs/PAGER_INSTALL_RUNBOOK.md)
