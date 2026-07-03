# SQL-First Schema

This app follows a portable SQL-first architecture where:

- Business rules live in the app service layer.
- SQLite is the runtime database (`data/digikot.db`).
- IDs are app-generated for portability.
- Money is stored as INTEGER paise.

Canonical DDL is in `server/db/migrations/001_init.sql`.

Legacy Postgres DDL (reference only): `sql/schema.sql`.

## Core tables

- `users` (`waiter|kitchen_supervisor|manager`, PIN login model)
- `restaurant_tables`
- `table_sessions`
- `menu_items`
- `kots`
- `kot_items`
- `cancel_requests`
- `bills`
- `bill_items`
- `notifications`
- `audit_logs`
- `postprep_adjustments`
- `pager_devices`
- `pager_assignments`

## Provider boundary rule

No component, screen, or service should call the database directly.

- Allowed: `src/repositories/*` → `src/lib/db/dbAdapter.js` → `src/lib/api/apiClient.js`
- Allowed: `src/realtime/socketIoRealtimeAdapter.js`
- Not allowed: `src/components/*`, `src/services/*` importing DB clients directly
