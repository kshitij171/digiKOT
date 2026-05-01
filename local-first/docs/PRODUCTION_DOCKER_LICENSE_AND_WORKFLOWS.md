# Production Docker, license strategy, and engineering workflows

This document explains **how the production-style Docker layout works**, **what changed when Option 3 Chunk 1 landed**, **how the upcoming license system is supposed to behave** (specification level; implementation may be partial until Chunk 2+), and **how to work safely with Git, secrets, and customer bundles**.

Shorter operational excerpts also appear in [`../README.md`](../README.md). Read this file for **depth, rationale, and “what not to do”** (especially around licenses and images).

---

## 1. Two deployment modes side by side

| Mode | Compose file | Audience | Exposes |
|------|----------------|----------|---------|
| **Development** | `local-first/docker-compose.yml` | Engineers on laptops | Postgres `5432`, MQTT `1883`; Node + Vite run **on the host** |
| **Production-style (LAN)** | `local-first/docker-compose.prod.yml` | Restaurant server / sealed appliance | **Only** nginx **80** + Mosquitto **1883**; Postgres and API are **internal** to the Docker network |

They are **intentionally separate**: dev compose is optimized for debugging; prod compose is optimized for **minimal LAN attack surface** and **no bind-mounts of application source**.

---

## 2. Option 3 Chunk 1 — what was implemented (Docker)

Chunk 1 delivers **runnable production-style artifacts** inside the repo so you can build and test without shipping the monorepo to a restaurant.

### 2.1 Four services only

| Service | Image / build | LAN exposure | Notes |
|---------|---------------|--------------|--------|
| `postgres` | `postgres:16-alpine` | **None** (no `ports:`) | Data in named volume `digikot_pg_data` |
| `mosquitto` | Build from `local-first/mosquitto/` | **1883** | Config + ACL bind-mounted from bundle (operator files, not app `src`) |
| `server` | Build from `local-first/server/Dockerfile` | **None** | Listens on **3000** inside the network; **non-root** user; runs migrations then app |
| `nginx` | Build from `local-first/nginx/Dockerfile` | **80** | **Single edge container**: serves **built** static UI + proxies `/api` and `/socket.io` to `server:3000` |

**Important design decision:** there is **no** separate `web` container. A second nginx layer was rejected to avoid confusion and double-proxy bugs. The **`digikot-nginx`** image **contains only** `web/dist/` plus nginx config.

### 2.2 Server image (`server/Dockerfile`)

- **Build context** must be **`local-first/`** (parent of `server/`), because the image copies **`db/`** to **`/db`** for migrations.
- **Dependencies:** `npm ci --omit=dev` (production install only).
- **`node-pg-migrate`** was moved from `devDependencies` to **`dependencies`** so migrations can run inside the image.
- **Entrypoint** (`server/scripts/docker-entrypoint.sh`):
  - If `RUN_MIGRATIONS_ON_START=1` (default in `deploy/.env.example`), runs:  
    `node-pg-migrate up -m /db/migrations`
  - Then starts: `node src/app.js`
- **User:** `nodejs` (uid 1001) — not root.
- **Internal port:** `3000`.

### 2.3 Nginx image (`nginx/Dockerfile`)

- **Stage 1:** Node image runs `npm ci` and `npm run build` in `web/`.
- **Stage 2:** `nginx:alpine` copies **`dist/`** to `/usr/share/nginx/html` and installs `nginx.prod.conf` as the default site.
- **Source maps:** disabled in `web/vite.config.js` (`build.sourcemap: false`) so production static assets do not leak debuggable source.

### 2.4 Nginx routing (`nginx/nginx.prod.conf`)

- **`/`** — static SPA with `try_files` fallback to `index.html` (React Router friendly).
- **`/api/`** — reverse proxy to `http://server:3000` (Fastify).
- **`/socket.io/`** — same upstream with **WebSocket upgrade** headers and long read timeouts (realtime stability).

Basic **security headers** are set (nosniff, frame options, referrer policy). **HTTPS** is intentionally deferred for phase-1 LAN HTTP.

### 2.5 Production compose (`docker-compose.prod.yml`)

- **`--env-file deploy/.env`** is expected (copy from `deploy/.env.example`).
- **`POSTGRES_DB` / `POSTGRES_USER`** default to `digikot` if unset; **`POSTGRES_PASSWORD`** must be set for a real deploy.
- **`DATABASE_URL`** inside `deploy/.env` must use hostname **`postgres`** and credentials that match **`POSTGRES_*`**.
- **`MQTT_URL`** should be **`mqtt://mosquitto:1883`** inside the stack.
- **Volumes:**
  - `./license:/app/license:ro` — **runtime only** customer license material (see §4).
  - `digikot_backups:/backups` — reserved for backup workflows (scripts in a later chunk).

### 2.6 CORS change (server)

When **`NODE_ENV=production`**, Fastify CORS uses **`origin: true`** so tablets that open `http://<LAN-IP>/` and call same-origin `/api` are not blocked by a hard-coded localhost allow list. Dev mode keeps the stricter list for Vite on `localhost:5173`.

---

## 3. License strategy (spec + Chunk 1 hooks)

### 3.1 What exists today (Chunk 1)

- **Compose** bind-mounts **`./license` → `/app/license`** on the **server** container **read-only**.
- **`deploy/.env.example`** documents **`LICENSE_FILE_PATH`** and **`PUBLIC_LICENSE_KEY_PATH`**.
- **No verification logic yet** in the server (Chunk 2). The mount and env vars are **plumbing only** so Chunk 2 can land without reshaping compose.

### 3.2 What must never happen (customer safety + your IP)

| Artifact | Rule |
|----------|------|
| **`license.key`** | **Never** `COPY` into a Docker image. **Never** commit to Git. It is **per-restaurant** and must appear only as a **runtime read-only mount**. |
| **Private signing key** | Lives only in **`tools/license-generator/`** (future) on **your** machine. **Never** in `local-first/`, **never** in images, **never** in customer tarballs. |
| **Public key** | May be **`COPY`**’d into the server image **at build time** (Chunk 2) or mounted read-only like the license—pick one approach and document it for releases. |

### 3.3 Planned license behavior (Chunks 2–3 — summary)

Aligned with [`.cursor/plans/option-3-docker-license-deploy.plan.md`](../../.cursor/plans/option-3-docker-license-deploy.plan.md):

1. **Signed JSON license** (`license.key`): payload (restaurant id, expiry, features, limits) + signature.
2. **Verify** with **asymmetric crypto** (e.g. RSA-SHA256 or Ed25519): app ships **public key only**.
3. **Machine binding:** fingerprint from **`/etc/machine-id`** + **first stable non-internal MAC** — **not** hostname and **not** LAN IP as required inputs (too fragile across DHCP / renames).
4. **Enforcement points:** server startup; **protected** HTTP routes; **Socket.IO** handshake or middleware.
5. **Always-on diagnostics when invalid:** `GET /api/health`, `GET /api/system/status`, `GET /api/license/status`, `POST /api/license/reload` — so onsite staff can see *why* the system refuses business traffic.
6. **`tools/license-generator/`**: internal CLI to mint `license.key` from customer fingerprint + contract terms.

Until Chunk 2 ships, treat license fields as **documentation and compose wiring**.

---

## 4. How to use the production-style stack (step by step)

### 4.1 Prerequisites

- Docker + Docker Compose v2
- A machine that will be the **LAN hub** (static IP or DHCP reservation recommended)

### 4.2 One-time file prep

From `local-first/`:

```bash
cp deploy/.env.example deploy/.env
```

Edit **`deploy/.env`**:

- Set strong **`POSTGRES_PASSWORD`**
- Set **`DATABASE_URL`** to match:  
  `postgresql://<POSTGRES_USER>:<POSTGRES_PASSWORD>@postgres:5432/<POSTGRES_DB>`
- Set **`MQTT_USER` / `MQTT_PASSWORD`** to match the Mosquitto image users (see `mosquitto/` Dockerfile / dev docs)
- Set **`MQTT_URL=mqtt://mosquitto:1883`**

Create **`license/`** on the host (repo includes `license/.gitkeep`). When Chunk 2 exists, place **`license/license.key`** there before or after first boot; the directory mount should exist so Compose does not fail on missing bind path (Docker often creates an empty host dir if missing—do not rely on that for production; ship the folder in your tarball).

### 4.3 Build and run

```bash
cd local-first
docker compose -f docker-compose.prod.yml --env-file deploy/.env build
docker compose -f docker-compose.prod.yml --env-file deploy/.env up -d
```

### 4.4 Verify

- From a tablet browser: **`http://<SERVER_IP>/`** (port 80) — SPA loads from nginx.
- Same origin API: open devtools and confirm **`/api/health`** returns JSON.
- MQTT client (or ESP): **`SERVER_IP:1883`** with correct credentials.

### 4.5 Migrations on every start

Default **`RUN_MIGRATIONS_ON_START=1`** applies migrations on container start. For strict release control, set **`RUN_MIGRATIONS_ON_START=0`** and run migrations via an explicit ops step (document that procedure when you flip the flag).

---

## 5. How to “save code” and ship changes (developer workflow)

### 5.1 Day-to-day Git

```bash
git status
git add local-first/            # or narrower paths
git commit -m "Describe change"
git push
```

**Scope discipline**

- **Local-first features:** touch files under `local-first/` (and later `tools/license-generator/` for license minting only).
- **Legacy app fixes:** touch root `src/` etc. in **separate commits/PRs** when possible so reviewers can see isolation.

### 5.2 Secrets checklist (before every commit)

- [ ] No `deploy/.env` with real passwords
- [ ] No `license/license.key`
- [ ] No root `env` file with production secrets
- [ ] No private keys under `local-first/`

### 5.3 Future customer bundle (post Chunk 6)

Customers receive **image tarballs + compose + scripts + configs + their `license.key`**, not your Git repo. Your build pipeline will:

1. `docker build` server + nginx images with a version tag.
2. `docker save` → `images/*.tar`.
3. Assemble `digikot-local-<version>/` with compose, `deploy/` templates, scripts, checksums.

That flow is specified in the Option 3 plan; scripts land in later chunks.

---

## 6. Troubleshooting (production-style)

| Symptom | Likely cause | What to check |
|---------|--------------|----------------|
| Compose up fails on postgres | Missing `POSTGRES_PASSWORD` in `deploy/.env` | Fill env file; re-run with `--env-file deploy/.env` |
| UI loads but `/api` 502 | Server not listening / crashed on migrate | `docker compose logs server` |
| MQTT disconnected in status | Wrong `MQTT_URL` or credentials | `deploy/.env` vs Mosquitto passwd users |
| Migrations fail | Schema drift / wrong `DATABASE_URL` | Logs; confirm DB host **`postgres`** from inside compose |
| Tablets see blank API | CORS / wrong URL | Use nginx URL on port **80**, not raw port 3000 |

---

## 7. Related documents

- Quick reference + diagrams: [`../README.md`](../README.md)
- First implementation wave (local-first history): [`LOCAL_FIRST_IMPLEMENTATION_HISTORY.md`](LOCAL_FIRST_IMPLEMENTATION_HISTORY.md)
- Formal Option 3 roadmap/todos: [`../../.cursor/plans/option-3-docker-license-deploy.plan.md`](../../.cursor/plans/option-3-docker-license-deploy.plan.md)
