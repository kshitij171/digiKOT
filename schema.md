# SQL-First Schema

This app now follows a portable SQL-first architecture where:

- Business rules live in the app service layer.
- Supabase is the current SQL provider.
- IDs are app-generated for portability.

Canonical DDL is in `sql/schema.sql`.

## Core tables

- `users` (`waiter|kitchen|manager`, PIN login model)
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

## Provider boundary rule

No component, screen, or service should import Supabase directly.

- Allowed: `src/lib/db/`, `src/realtime/supabaseRealtimeAdapter.js`
- Not allowed: `src/components/*`, `src/services/*`
