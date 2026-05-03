# digiKOT — work log for 3 May

A plain-text recap of everything we touched, configured, and ran on the bench today. No code, no commands — just what happened and why.

## Overview

Today was about getting the **pager / MQTT path** wired and runnable end-to-end on the local machine. We finalized the manager-only pager registration flow, switched the web app over to a local Supabase stack, picked the right LAN IP for the MQTT broker, started Mosquitto in Docker, ran the pager-bridge against it, and traced the kitchen-to-pager flow in code so we know exactly when an item marked **done** in the kitchen will reach the waiter’s pager.

## Pager system, end to end

The pager system is made up of four moving parts that we exercised today.

- **Database.** A pager-pool migration adds two tables — one for the pool of physical pagers (`pager_devices`, holding MAC + free-form `device_code`) and one for active assignments to waiters (`pager_assignments`, with a `released_at` column so unassign is non-destructive). It also adds a service-role-only RPC, `fetch_notifications_after`, that the bridge uses as a cursor over the `notifications` table.
- **App service / repository layer.** A pager repository handles lookups by code and by MAC; the manager service exposes assign, unassign, register-device, delete-if-unassigned, and a dashboard listing. MAC normalization lives in the service so callers don’t have to think about it.
- **UI.** A dedicated page at `/pager-register` lets the manager add a pager by MAC and a free-form device code (no five-character cap; `pager_1` is fine). The Pagers tab inside `/manager` is **assign-only** — there is intentionally no MAC entry there, to keep registration in one place.
- **Bridge.** A small Node service in `pager-bridge/` polls Supabase for new notifications, looks up the active pager assignment for that waiter, and publishes a JSON message to MQTT topic `kot/pager/<device_code>/notify`. If no pager is assigned to that waiter, it logs `no_pager_for_waiter` and does not publish.

## Local development setup

We pointed the web app at the locally-running Supabase stack instead of the hosted one. This is done with a `.env.local` file at the project root that overrides the URL with the local API URL and the local anon JWT. `.env.local` is gitignored so it never gets committed.

Demo logins we kept using:
- Manager `mgr1` with PIN `4321`.
- Kitchen supervisor `ksup1` with PIN `9999`.
- Waiter `waiter1` with PIN `1234` (and `waiter2` with `5678`).

We confirmed that the manager-only pager APIs require a manager session — a waiter who navigates to `/manager` cannot perform pager actions because the `assertManager` check rejects them.

## pager-bridge configuration changes today

This is where most of the actual file changes happened today.

- Added `pager-bridge/.env.example` documenting the four variables the bridge needs: the local Supabase URL, the Supabase service-role key, the MQTT URL, and the poll interval. The example points MQTT at the LAN IP so anyone reading the file knows it should not be `127.0.0.1`.
- Added `pager-bridge/.env` (gitignored) with the real values for this machine — the local Supabase URL, the service-role key copied out of the local Supabase status output, and the MQTT URL set to this Mac’s Wi-Fi IP `192.168.29.167` on port `1883`.
- Updated `pager-bridge/package.json` so its start script loads the `.env` file automatically using Node’s built-in env-file loader. We are on Node 24, so this works without any extra dependency.
- Updated `pager-bridge/README.md` to describe the new env-file workflow (copy the example, fill in the keys), and to call out clearly that the MQTT host must be the **broker’s LAN IP**, not `127.0.0.1`, otherwise phones and the ESP8266 cannot reach it from Wi-Fi.

## Running the broker and bridge

The first time we started the bridge it kept logging `connect ECONNREFUSED 192.168.29.167:1883`. That was expected — nothing was actually listening on port `1883` on this machine yet.

We then started **Mosquitto** as a Docker container named `digikot-mosquitto`, using the official `eclipse-mosquitto:2` image, with port `1883` published to the host. The bridge immediately reconnected and logged `mqtt_connected` to `mqtt://192.168.29.167:1883`.

Later in the session we wound the bench down: the Vite dev server, the pager-bridge process, and the Mosquitto container were all stopped. The Mosquitto container still exists on disk, so it can be started again without re-pulling the image.

## Kitchen “KOT done” → pager — what we traced

We walked through the code path so we are confident about when a pager will actually beep.

1. In the kitchen UI, marking a line item as **done** calls the KOT service’s `markItemStatus` with status `done`.
2. That service loads the KOT, updates the item, and — if the KOT has a `waiter_user_id` — inserts a row into `notifications` with `event_type` set to `item_ready` and a payload containing the KOT id, item id, and status. The notification is targeted at **whichever waiter placed that KOT**, by user id, not by username.
3. The bridge polls `fetch_notifications_after` and picks up the new row.
4. For each row it looks up the waiter’s active pager assignment. If one exists, it publishes the payload as JSON to topic `kot/pager/<device_code>/notify`. If not, it logs `no_pager_for_waiter` and skips MQTT.
5. The ESP (or any subscriber) must be subscribed to the matching topic for its assigned device — for example `kot/pager/pager_1/notify`.

In short: yes, the pager will receive the notification when all four of these are true at the same time — the KOT was placed by that waiter’s account, a pager is currently assigned to that waiter, the bridge process is running and connected to MQTT, and the device is subscribed to the right per-device topic.

## Operational notes captured today

- Mac LAN IP used as the MQTT host today: `192.168.29.167` on `en0`. If the Wi-Fi network changes, the IP changes too, and the `MQTT_URL` in `pager-bridge/.env` must be updated.
- Mosquitto must be reachable on TCP `1883`; macOS firewall could block inbound on that port.
- Per-device MQTT topic shape: `kot/pager/<device_code>/notify`. In this session the device was `pager_1`, MAC `C8:C9:A3:2E:D3:86`, assigned to Waiter One.
- Manager-only routes touched today: `/pager-register` for adding pagers, `/manager` Pagers tab for assigning to waiters.
- `.env` and `.env.local` are both gitignored. The committed examples (`.env.example` for the bridge, `.env` for the web app on the hosted environment) stay clean of secrets.

## What is still open / good follow-ups

- Small UX polish on the manager Pagers tab: add a button or link to `/pager-register`, and replace the empty-state copy that still mentions the old “SQL editor” path.
- Move the bridge from polling to Supabase Realtime on the `notifications` table when we want lower latency.
- Tighten MQTT delivery (QoS, retries, last-will) once we leave bench testing and start running on actual restaurant hardware.
- Stand up a small smoke-test that places a KOT, marks an item done, and asserts a published MQTT message — useful before any deployment.

## Quick recap of state at end of day

- Local Supabase: still running, web app pointed at it via `.env.local`.
- pager-bridge: stopped (was connected and healthy when running).
- Mosquitto Docker container `digikot-mosquitto`: stopped (still on disk).
- ESP8266: configured for topic `kot/pager/pager_1/notify` and broker `192.168.29.167:1883`; will beep again as soon as Mosquitto and the bridge are restarted.
