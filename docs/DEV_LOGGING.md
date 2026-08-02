# Dev diagnostics logging

Unified **development-only** JSONL logs for tracing user actions through API calls and server responses. These logs are separate from production file logs in `data/logs/`.

## Enable

**Server** (both required):

```env
DEV_DIAGNOSTICS=1
NODE_ENV=development
```

**Client** (Vite dev only):

```env
VITE_DEV_DIAGNOSTICS=1
```

Run with `npm run dev:all` and open `http://localhost:5173`.

When disabled:

- No writes to `dev-logs/`
- `POST /api/dev/log` returns **404**
- Client `devLog()` is a no-op

## Log file

One file per day:

```text
dev-logs/diagnostics-YYYY-MM-DD.jsonl
```

Each line is one JSON event with `schemaVersion`, `appVersion`, `ts`, `layer`, `event`, `traceId`, `sessionId`, `requestId`, and optional `userId`, `role`, `message`, `meta`.

## Tracing a bug

1. Reproduce the issue with flags on (e.g. Clear Table failure).
2. Open today’s file and grep by action or `traceId`:

   ```bash
   grep 'clear_table' dev-logs/diagnostics-$(date +%Y-%m-%d).jsonl
   grep '<traceId>' dev-logs/diagnostics-$(date +%Y-%m-%d).jsonl
   ```

3. A complete trace should include:
   - `ui.action.start` (client)
   - `api.request` / `api.error` (client + server)
   - `ui.action.error` with the real `message` (client)

4. Attach the relevant JSONL lines to bug reports.

## Redaction policy

Centralized redaction strips or masks:

- PINs, passwords, tokens, cookies, authorization headers, secrets
- WhatsApp credentials, Wi-Fi SSID
- Phone numbers → last 4 digits only

Full request/response bodies are **not** logged. String fields are truncated; lines over 8 KB are dropped.

## Retention

Files older than **14 days** are deleted on server start (`DEV_LOG_RETENTION_DAYS` to override). Files over 50 MB rotate to `diagnostics-YYYY-MM-DD.N.jsonl`.

## Safety check

With `DEV_DIAGNOSTICS` unset:

```bash
npm run test:dev-diag-off
```

Verifies the dev route returns 404 and `dev-logs/` is not created.

## Never enable in production

Do not set `DEV_DIAGNOSTICS=1` on the restaurant laptop. Production logging remains in `data/logs/` via `server/lib/fileLogger.js`.
