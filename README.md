# digiKOT

Restaurant KOT system — **Node.js + SQLite + Fastify + Vite + Socket.IO + embedded MQTT**. No Supabase or Docker required for local dev.


## Cursor Agent setup

**Goal:** Make `npm run dev:all` work at `http://localhost:5173` with login PINs below.

### Prerequisites (check first)

| Requirement | Notes |
|-------------|--------|
| **Node.js 20–26** | `node -v` must be `v20.x`–`v26.x` (see `package.json` `engines`) |
| **npm** | Comes with Node |
| **macOS / Linux / Windows** | `better-sqlite3` compiles native code on `npm install` |
| **Ports free** | `3000` (API), `5173` (Vite dev UI), `1883` (MQTT) |

If ports are in use:

```bash
# macOS / Linux
lsof -ti :3000 -ti :1883 -ti :5173 | xargs kill -9 2>/dev/null || true
```

### Step 1 — Install dependencies

From the repo root:

```bash
npm install
```

If `better-sqlite3` fails to build, install Xcode Command Line Tools (macOS) or Visual Studio Build Tools (Windows), then rerun `npm install`.

### Step 2 — Create `.env.local` (not committed to Git)

`.env.local` is **gitignored**. Every developer needs their own copy.

```bash
cp .env.example .env.local
```

Edit `.env.local` for **local development**. Minimum working dev config:

```env
# Dev mode (do NOT use production here for local work)
NODE_ENV=development
PORT=3000
LISTEN_HOST=0.0.0.0
DATABASE_PATH=./data/digikot.db
SESSION_SECRET=dev-local-change-me-to-any-long-string
SESSION_TTL_HOURS=8
MQTT_PORT=1883

LOGIN_MAX_ATTEMPTS=5
LOGIN_LOCKOUT_MINUTES=15

# Realtime (required — use socketio, not supabase)
VITE_REALTIME_MODE=socketio

# Setup UI (/setup) — pick any password for local dev
SETUP_UI_PASSWORD=change-me-installer

# Optional: dev-only JSONL diagnostics (see docs/DEV_LOGGING.md)
# DEV_DIAGNOSTICS=1
# VITE_DEV_DIAGNOSTICS=1
```

**Important:** `data/` and `.env.local` are not in Git. A fresh clone has **no database** until you migrate/seed.

### Step 3 — Database migrate + seed

```bash
npm run db:migrate
npm run db:seed
```

This creates `data/digikot.db` with:

- 4 demo users (PINs below)
- 20 tables (1–20)
- Sample categories + one demo menu item

For a **full restaurant menu** (like a migrated production copy), ask the team lead for a `data/digikot.db` export or use the legacy import scripts (`npm run db:import`) — not needed for basic dev.

### Step 4 — Start development

```bash
npm run dev:all
```

| Service | URL |
|---------|-----|
| **UI (use this in browser)** | http://localhost:5173 |
| **API (direct)** | http://localhost:3000 |
| **Health check** | http://localhost:3000/api/health |

Vite proxies `/api` and `/socket.io` to port 3000.

**Other devices on the same Wi‑Fi:** on the PC run `npm run dev:all`, then on phones/tablets open `http://<pc-wifi-ip>:5173` (use the `192.168.x.x` address printed in the terminal — not `localhost`, and not a `172.x` Hyper-V/WSL address). Login uses a bearer token stored on the device so it works over plain HTTP on the LAN.

### Step 5 — Verify setup

Run in a second terminal:

```bash
npm run smoke
```

Expected: health JSON with `"ok": true`.

Run the full POS checklist suite (API + unit + static contracts; requires `dev:all`):

```bash
npm test
```

Expected: all cases `PASS`.

Optional:

```bash
npm run test:dev-diag-off
```

(Only relevant if you are checking dev diagnostics are off by default.)

### Step 6 — Login and test flows

Open **http://localhost:5173/login**

| Role | PIN | Home route |
|------|-----|------------|
| Waiter 1 | `1234` | `/waiter` |
| Waiter 2 | `5678` | `/waiter` |
| Kitchen supervisor | `9999` | `/kitchen` |
| Manager | `4321` | `/manager` |
| Owner | `1357` | `/manager` |

**Kitchen + waiter at the same time:** use **two browser tabs** (or incognito for the second role). One session cookie = one role; `/kitchen` redirects waiters back to `/waiter`.

**Quick test:**

1. Waiter → pick a table → add items → submit KOT  
2. Kitchen (separate tab, PIN `9999`) → order should appear on live KOTs  
3. Manager (PIN `4321`) → audit / bill mod tabs load

---

## What is NOT in Git

| Path | Why |
|------|-----|
| `data/` | SQLite database — create with `db:migrate` + `db:seed` |
| `.env.local` | Secrets and local overrides — copy from `.env.example` |
| `node_modules/` | Run `npm install` |
| `dev-logs/` | Dev diagnostics JSONL (if enabled) |

---

## Daily commands

```bash
npm run dev:all          # Dev: API :3000 + UI :5173
npm run build            # Production frontend build → dist/
npm run start            # Production: single server on :3000 (run build first)
npm run db:migrate       # Apply SQL migrations
npm run db:seed          # Demo users + tables (safe to re-run; uses INSERT OR IGNORE)
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `EADDRINUSE` on 3000 or 1883 | Kill old node processes (see port command above), restart `npm run dev:all` |
| `ECONNREFUSED` on Vite proxy | Backend not running — wait for `digiKOT server http://...` in terminal |
| Kitchen empty but waiter submitted order | Open kitchen in **incognito** with PIN `9999`; confirm `VITE_REALTIME_MODE=socketio` |
| Login fails | Rerun `npm run db:seed`; check PIN table above |
| `no such table` / empty DB | Run `npm run db:migrate` then `npm run db:seed` |
| Clear table fails | Pull latest code; restart server (waiter delete permission fix) |

---

## More documentation

| Doc | Purpose |
|-----|---------|
| [docs/PRODUCTION_OPERATIONS.md](docs/PRODUCTION_OPERATIONS.md) | Restaurant laptop deploy |
| [docs/PARITY_SIGNOFF.md](docs/PARITY_SIGNOFF.md) | Manual QA checklist |
| [docs/DEV_LOGGING.md](docs/DEV_LOGGING.md) | Dev diagnostics JSONL |
| [docs/BUGFIX_WORKFLOW.md](docs/BUGFIX_WORKFLOW.md) | How to report/fix bugs |
| [.env.example](.env.example) | All env var reference |

---

## Architecture (one line)

**Browser** → Vite `:5173` (dev) or Fastify static `dist/` (prod) → **Fastify API** + **Socket.IO** + **SQLite** + **MQTT :1883** for pagers.
