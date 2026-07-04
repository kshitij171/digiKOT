# SQL-First Schema

This app now follows a portable SQL-first architecture where:

- Business rules live in the app service layer.
- Supabase is the current SQL provider.
- IDs are app-generated for portability.

Canonical DDL is in `sql/schema.sql`.

## Core tables

- `users` (`waiter|kitchen_supervisor|manager|owner`, PIN login model)
- `restaurant_tables`
- `table_sessions`
- `menu_items` (grouped by text `category`; no separate categories table)
- `kots`
- `kot_items`
- `cancel_requests`
- `bills` (includes `items` jsonb — line-item snapshots)
- `bill_modification_requests`
- `notifications`
- `audit_logs`
- `pager_devices` / `pager_assignments` (Supabase migration)

Operational log retention: `purge_old_operational_logs()` (manager Tools tab).

## Provider boundary rule

No component, screen, or service should import Supabase directly.

- Allowed: `src/lib/db/`, `src/realtime/supabaseRealtimeAdapter.js`
- Not allowed: `src/components/*`, `src/services/*`
