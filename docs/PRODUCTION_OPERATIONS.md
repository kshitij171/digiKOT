# Production operations

## Requirements

- **Node.js:** 20 LTS or 22 LTS (see `package.json` `engines`)
- Windows 10/11 restaurant laptop
- 2.4 GHz Wi-Fi for tablets and ESP8266 pagers

## First install

```bash
cp .env.example .env
# Edit .env — set SESSION_SECRET and SETUP_UI_PASSWORD

npm install
npm run db:migrate
npm run build
npm run start
```

Open `http://<laptop-lan-ip>:3000`

## Daily start / stop

```bash
npm run start          # production
# Ctrl+C to stop
```

Development (engineers only):

```bash
npm run dev:all        # Fastify :3000 + Vite :5173
```

## Firewall (restaurant LAN)

| Port | Protocol | Service |
|------|----------|---------|
| 3000 | TCP | HTTP + Socket.IO |
| 1883 | TCP | MQTT (embedded) |
| 50505 | UDP | Pager setup discovery |

Allow **node.exe** through Windows Firewall for incoming LAN connections.

## Backup

```bash
# While server is stopped (or use SQLite backup API)
cp data/digikot.db data/backups/digikot-$(date +%Y%m%d).db
```

**Never commit** `data/digikot.db`, `data/logs/`, `data/backups/`, or `.env`.

## Restore

1. Stop server
2. Replace `data/digikot.db` from backup
3. `npm run start`

## Upgrade

```bash
git fetch
git checkout vX.Y.Z          # tagged release
npm install
npm run build
npm run smoke
npm run start
```

## Logs

- Server stdout (console)
- File: `data/logs/digikot-YYYY-MM-DD.log`
- Version: `GET /api/health` → `{ version, node, db, mqtt, socketClients }`

## Setup install limitation (v1)

Pager setup Wi-Fi config and push commands are **in-memory**. If the server restarts during install:

1. Re-open `/setup`
2. Re-save restaurant Wi-Fi
3. Re-push to ESPs on ROOT

## Smoke check

```bash
npm run smoke
# or: node scripts/smoke-production.mjs http://127.0.0.1:3000
```
