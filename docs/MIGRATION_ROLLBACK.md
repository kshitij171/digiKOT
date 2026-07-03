# Production rollback playbook

If SQLite migration fails verification on a restaurant laptop, return to the legacy Supabase stack.

## Before migration

1. **Backup Postgres** (production — never `db reset` first):
   ```bash
   pg_dump "$DATABASE_URL" -f backup-$(date +%Y%m%d).sql
   ```
2. Run `npm run db:export -- --mode=production`
3. Keep `backup-*.sql` and `server/db/fixtures/export/` safe offline

## Migration steps

1. `npm run db:migrate`
2. `npm run db:import`
3. `npm run db:verify`
4. Start new stack: `npm run dev:all` or `npm run start`
5. Run manual parity checklist (auth, KOT, billing, pager, LAN)

## If verification fails

1. **Stop** new Node server
2. **Do not delete** `backup-*.sql` or export JSON
3. Restore Postgres from backup:
   ```bash
   psql "$DATABASE_URL" -f backup-YYYYMMDD.sql
   ```
4. Start legacy stack: `npx supabase start`, `npm run install:full` (on pre-cleanup branch)
5. Document failure in issue tracker; fix import script before retry

## SQLite rollback (new stack only)

Copy `data/digikot.db` to `data/backups/digikot-YYYYMMDD.db` before each upgrade.

## Network ports (one process, multiple ports)

| Port | Service |
|------|---------|
| 3000 | HTTP + Socket.IO (default; avoids Windows port 80 admin) |
| 1883 | MQTT (aedes) |
| 50505 | UDP pager discovery |
