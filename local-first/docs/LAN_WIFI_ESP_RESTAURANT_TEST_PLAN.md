# Plan: LAN + Wi‑Fi + ESP restaurant-style test setup

This document captures decisions and steps from recent discussions: **using a home/ISP Wi‑Fi router (e.g. TP-Link XC220-G3v) as the LAN**, **laptop as the app server**, **tablet/phone as clients**, and **ESP32 + OLED as an MQTT pager**, plus how that ties to **kitchen → waiter notifications** in the `local-first` architecture.

---

## 1. Goals

- Run **Docker** (Postgres + Mosquitto) and **Node (Fastify)** on a **laptop** on the same Wi‑Fi as other devices.
- Open the **local-first web UI** from a **kitchen tablet** and a **waiter phone** using the laptop’s **LAN IP** (not localhost on those devices).
- Connect an **ESP32** on the same Wi‑Fi to **MQTT** on the laptop (`:1883`) and show/beep on **OLED** when messages arrive.
- Long term: when kitchen marks a KOT line **Done**, publish to **`kot/v1/{restaurantId}/waiter/{waiterUserId}/events`** (waiter pager path). Short term: validate stack using **existing** test publish to **`kot/v1/{restaurantId}/kitchen/events`**.

---

## 2. Router and Wi‑Fi (TP-Link XC220-G3v or any similar AP)

**Yes — this class of router is suitable.** It provides:

- DHCP (IPs like `192.168.1.x` for laptop, tablet, phone, ESP)
- Wi‑Fi access point for all devices on one LAN

### 2.1 Dual band (AC1200) and ESP32

- Router is **2.4 GHz + 5 GHz**.
- **ESP32 Wi‑Fi is almost always 2.4 GHz only.** Join the **2.4 GHz** SSID (or a dedicated 2.4 GHz SSID if you split bands).
- Laptop / tablet / phone can use **5 GHz** for speed if you like; they only need to reach the laptop’s IP.

### 2.2 LAN-only testing (no internet)

- For **pure LAN** tests (kitchen → server → MQTT → ESP), **WAN / fiber online is not strictly required** as long as the router still runs **Wi‑Fi + DHCP**.
- If the box disables Wi‑Fi without WAN, connect WAN or use another AP; most home routers still serve LAN Wi‑Fi without upstream.

### 2.3 Settings to verify in router admin

- **Disable AP / wireless client isolation** (names vary) so Wi‑Fi clients can reach the laptop.
- Optional: **DHCP reservation** for the laptop so its IP does not change between tests.

---

## 3. Role of each device

| Role | Hardware | What runs |
|------|-----------|-----------|
| Server host | Laptop | Docker Compose (`local-first/docker-compose.yml`), `local-first/server` (Fastify + outbox worker), optional `local-first/web` dev server |
| Kitchen UI | Tablet browser | `http://<LAPTOP_LAN_IP>:5173` (Vite must bind `0.0.0.0`) |
| Waiter UI | Phone browser | Same URL (different user/session later) |
| Pager | ESP32 + OLED | Wi‑Fi STA to same SSID (2.4 GHz); MQTT to `<LAPTOP_LAN_IP>:1883` |

---

## 4. Laptop preparation

### 4.1 Find LAN IP

- macOS: **System Settings → Network → Wi‑Fi** (or `ipconfig getifaddr en0` in Terminal).
- Use this IP everywhere below as **`LAPTOP_IP`**.

### 4.2 Firewall

- Allow inbound **3000** (API), **5173** (Vite dev), **1883** (Mosquitto) from the LAN, or temporarily relax firewall to confirm connectivity.

### 4.3 Environment

- File: `local-first/.env` (from `.env.example`).
- Set **`LISTEN_HOST=0.0.0.0`** so Fastify accepts connections from tablets/phones, not only localhost.
- **`DATABASE_URL`** must match Docker Postgres (see main README).
- **`MQTT_URL`**: for server on host talking to Mosquitto in Docker, use **`mqtt://127.0.0.1:1883`** (published port on laptop). ESP uses **`mqtt://<LAPTOP_IP>:1883`**.

---

## 5. Commands (order)

**Terminal A — data plane**

```bash
cd /path/to/digiKOT
docker compose -f local-first/docker-compose.yml up -d
docker compose -f local-first/docker-compose.yml ps
```

**Terminal B — API**

```bash
cd /path/to/digiKOT/local-first/server
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

**Terminal C — web (LAN-visible)**

```bash
cd /path/to/digiKOT/local-first/web
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

**On tablet/phone:** open **`http://LAPTOP_IP:5173`**.

---

## 6. MQTT and ESP32

### 6.1 Broker

- Mosquitto listens on **`LAPTOP_IP:1883`** from the LAN (Docker publishes host port `1883`).

### 6.2 Credentials (default dev image in repo)

- Server publishes as **`kot_server`** (password from Mosquitto image build — see `local-first/README.md` / `mosquitto/Dockerfile`).
- ESP can use dev user **`esp_waiter_1`** / **`esp_dev_pass`** (same Dockerfile defaults), subject to **`local-first/mosquitto/acl`**.

### 6.3 Topics (v1)

- Kitchen-wide (used by **current** server test path): `kot/v1/default/kitchen/events`
- Waiter-specific (target architecture for **Done**): `kot/v1/default/waiter/<waiterUserId>/events`  
  Example waiter id from seed: **`u_waiter_1`** (confirm in `local-first/db/seed/dev_seed.sql`).

### 6.4 ESP firmware behavior (test phase)

1. Connect Wi‑Fi (2.4 GHz) to same SSID as laptop.
2. MQTT connect to **`LAPTOP_IP:1883`** with **`esp_waiter_1`** credentials.
3. Subscribe to **`kot/v1/default/kitchen/events`** for the **current** server “Test notification” path.
4. On message: parse JSON (`v`, `kind`, `message`, …), show on OLED, optional buzzer.
5. Later: subscribe to **`.../waiter/u_waiter_1/events`** once Fastify implements **mark-item-status** + outbox enqueue for that topic.

---

## 7. What works today vs implementation gap

| Scenario | Status |
|----------|--------|
| LAN access to UI + API from tablet/phone | Works if Vite **`--host 0.0.0.0`** and **`LISTEN_HOST=0.0.0.0`** and firewall allow |
| **Devices** page → **Test notification** → MQTT `kitchen/events` | **Implemented** — good ESP smoke test |
| Kitchen marks KOT item **Done** → MQTT **waiter** topic | **Not yet in `local-first` Fastify** — needs port of legacy `markItemStatus` logic (`src/services/kotService.js`) + `notifications` + `mqtt_outbox` with `topicWaiterEvents` |

### 7.1 Legacy app reference (product behavior)

Kitchen updates item status and inserts a waiter-targeted notification in Supabase-era app:

- `src/services/kotService.js` → `markItemStatus` → `notificationService.createNotification` for `item_ready` / `item_out_of_stock`.

`local-first` should mirror that in the **server** with **outbox** for ESP.

---

## 8. Verification checklist

- [ ] Tablet opens `http://LAPTOP_IP:5173`
- [ ] Phone opens same URL
- [ ] `http://LAPTOP_IP:3000/api/health` returns JSON from phone browser
- [ ] `http://LAPTOP_IP:3000/api/system/status` shows `mqtt.connected: true` when broker is up
- [ ] ESP connects MQTT and receives payload after **Test notification** on Devices page
- [ ] Router: no client isolation; ESP on 2.4 GHz

---

## 9. Next implementation chunk (when coding)

1. Add Fastify route(s) for KOT item status update (parity with `markItemStatus`).
2. Transaction: update `kot_items`, optional menu OOS, insert **`notifications`**, insert **`mqtt_outbox`** with **`topicWaiterEvents(restaurantId, waiterUserId)`**.
3. Extend web: minimal kitchen screen or reuse API from a thin kitchen page hitting laptop.
4. ESP: switch subscribe to waiter topic; optional **ACK** publish per `firmware/README.md`.

---

## 10. Related docs

- [README.md](../README.md) — dev URLs, compose, MQTT defaults
- [PRODUCTION_DOCKER_LICENSE_AND_WORKFLOWS.md](./PRODUCTION_DOCKER_LICENSE_AND_WORKFLOWS.md) — prod compose later
- [firmware/README.md](../firmware/README.md) — topic contract
