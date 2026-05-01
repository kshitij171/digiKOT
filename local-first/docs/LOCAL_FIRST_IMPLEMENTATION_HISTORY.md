# Local-first implementation history and architecture

This document is a **long-form companion** to [`../README.md`](../README.md). It records **what was built first** (the parallel “local-first” stack for offline/LAN KOT), **why the layout looks the way it does**, and **how the moving parts fit together** before production Docker (Option 3) work began.

If you only need quick commands, use the main [README](../README.md). Use this file when you need **context for onboarding, audits, or extending the system**.

---

## 1. Why `local-first/` exists

The repository originally contained a **browser-only** application at the root (`src/`, Vite, Supabase client) that talked directly to hosted Postgres via Supabase. That path remains valid for teams who want cloud-backed debugging or a gradual migration.

**Goal of `local-first/`:** add a **second, isolated product path** where:

- **PostgreSQL** runs locally (Docker).
- **Business logic and persistence** move toward a **Node (Fastify) server** as the single source of truth.
- **Browsers** use **HTTP + Socket.IO** only (no Supabase JS in `local-first/web`).
- **ESP32 devices** use **MQTT** only (Mosquitto), with **authenticated** broker access and a **durable outbox** so broker outages do not silently drop device events.

**Non-goal:** replace or delete the root app in one step. The rule is: **default work for the new stack happens only under `local-first/`** so the legacy UI and Supabase flow stay stable until you explicitly choose to retire them.

---

## 2. Repository boundary (critical for “how we save code”)

| Location | Role |
|----------|------|
| Repo root (`src/`, root `package.json`, `vite.config.js`, `sql/` for legacy) | **Legacy** Supabase-oriented Vite app. Treat as frozen unless doing a dedicated maintenance task. |
| `local-first/` | **New** stack: server, web, DB migrations for the local DB, Docker (dev + prod compose), nginx assets, firmware notes. |

**Git / saving changes**

- Commit **`local-first/`** as normal when you implement features there.
- Keep **secrets out of Git**: `local-first/.env`, `local-first/deploy/.env`, `local-first/license/license.key`, and repo-root `env` files should stay **gitignored** or untracked.
- **`node_modules`** under `local-first/server` and `local-first/web` are ignored; only `package.json` / `package-lock.json` are source of truth for dependencies.

---

## 3. Folder map (implementation phase 1)

| Path | Responsibility |
|------|------------------|
| `docker-compose.yml` | **Development** Postgres + Mosquitto (exposes `5432` for host-side tools, `1883` for MQTT). |
| `.env.example` / `.env` | Dev secrets for Node on the **host** (not used the same way inside production images). |
| `db/migrations/` | `node-pg-migrate` driver files (e.g. `*.cjs`). |
| `db/sql/` | Large SQL loaded by migrations (keeps migration files small). |
| `db/seed/dev_seed.sql` | Dev-only seed (staff, tables, sample `devices` row). |
| `server/` | Fastify app: routes, services, pool, MQTT client, **outbox worker**, Socket.IO on the HTTP server. |
| `web/` | Greenfield React UI (health, devices, home); Vite dev proxy to API. |
| `mosquitto/` | Broker image build (`Dockerfile` runs `mosquitto_passwd`), `mosquitto.conf`, `acl`. |
| `nginx/` | Dev sketch `nginx.conf`; **production** uses `Dockerfile` + `nginx.prod.conf` (see production doc). |
| `firmware/` | Topic contract (`README.md`) and Arduino stub (`esp32-notifier/`). |
| `license/` | Placeholder for **runtime** `license.key` mount in production (see production doc). |

---

## 4. Data model highlights (local-first DB)

The first migration brings over the **core KOT-shaped tables** (users, tables, sessions, menu, KOTs, bills, audit, etc.) aligned with the intent of root `sql/schema.sql`, plus three **first-class concepts** for the new architecture:

### 4.1 `notifications` (app-visible)

Rows represent **what humans or UIs should see**: type, targets, title, message, payload JSON, read/ack timestamps. This table answers “what happened in the business?” and can exist even if MQTT is disabled.

### 4.2 `mqtt_outbox` (delivery queue)

Rows are **technical**: `topic`, `payload` (JSON string), `status` (`pending` / `published` / `failed`), `attempt_count`, `last_error`, timestamps. A **worker** polls pending rows, publishes through the MQTT client, then updates status. This answers “did we successfully tell the devices?”

**Pattern:** in the same DB transaction as an important domain write, insert **`mqtt_outbox`** (and optionally **`notifications`**). Never rely on “fire-and-forget” MQTT publish alone for ESP-critical paths.

### 4.3 `devices` (registry)

Stores **`device_id`** (string used in MQTT topics, e.g. `esp-waiter-1`), **`mqtt_username`**, assignment hints, `last_seen_at`, etc. Powers **`/devices`** in the UI and ties test notifications to a real row.

---

## 5. Runtime flows (dev)

### 5.1 HTTP API

Fastify registers routes under **`/api`**. Early endpoints include health, system status, device list, and **test notification** (writes `notifications` + `mqtt_outbox`).

### 5.2 Socket.IO

Attached to the same Node HTTP server after `listen`. Used today for a simple **`system:hello`** ping on the Local health page; designed so future work can add **rooms** and **snapshot-on-connect** per restaurant/role.

### 5.3 MQTT

The server connects to Mosquitto with credentials from env. The **outbox worker** only publishes when the client reports **connected**.

### 5.4 “Test notification” smoke path

Documented step-by-step in the main README: UI → `POST /api/devices/test-notification` → transaction → outbox → worker → topic `kot/v1/default/kitchen/events`.

This path exists to **prove** server → DB → MQTT before the full KOT domain is reimplemented on the server.

---

## 6. Development workflow (typical day)

1. `docker compose -f local-first/docker-compose.yml up -d`
2. `cd local-first/server && npm install && npm run db:migrate && npm run db:seed`
3. `npm run dev` (server)
4. `cd ../web && npm install && npm run dev` (UI at `http://localhost:5173`)

Database backups for the **dev** Postgres container are documented in the README (`pg_dump` / `psql`).

---

## 7. What was deliberately deferred

The first implementation wave focused on **infrastructure and proof pipes**, not full product parity with the root app:

- Full **PIN/session auth** and role routing on the server.
- Full **menu / KOT / billing** APIs mirroring every legacy flow.
- Rich **Socket.IO** domain broadcasts.
- **License enforcement** (planned under Option 3 Chunk 2+).

Those items are expected to land incrementally still **under `local-first/`**.

---

## 8. Related reading

- Operational quick reference: [`../README.md`](../README.md)
- Product behavior reference (whole product, not only local-first): [`../../FUNCTIONALITY_DEEP_DIVE.md`](../../FUNCTIONALITY_DEEP_DIVE.md)
- Production Docker + license strategy and workflows: [`PRODUCTION_DOCKER_LICENSE_AND_WORKFLOWS.md`](PRODUCTION_DOCKER_LICENSE_AND_WORKFLOWS.md)
- ESP topics: [`../firmware/README.md`](../firmware/README.md)
