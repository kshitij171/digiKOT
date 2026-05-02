-- =============================================================================
-- Migration: PIN-based auth v2 — remove captain role, add waiter management
-- Run in Supabase Studio SQL editor (local Docker) or via: npx supabase db push
-- =============================================================================

-- ---------------------------------------------------------------------------
-- STEP 1: Migrate any existing captain rows to waiter before dropping the
--         constraint (safe to run even if no captain rows exist).
-- ---------------------------------------------------------------------------
update users set role = 'waiter' where role = 'captain';

-- ---------------------------------------------------------------------------
-- STEP 2: Drop the old role check and re-add without 'captain'.
-- ---------------------------------------------------------------------------
alter table users drop constraint if exists users_role_check;
alter table users
  add constraint users_role_check
  check (role in ('waiter', 'kitchen_supervisor', 'manager'));

-- ---------------------------------------------------------------------------
-- STEP 3: Add username column (unique, nullable — null for legacy rows).
--         Waiters get a username; kitchen/manager login by PIN hash only.
-- ---------------------------------------------------------------------------
alter table users add column if not exists username text;
create unique index if not exists idx_users_username
  on users (username)
  where username is not null;

-- ---------------------------------------------------------------------------
-- STEP 4: Enforce globally unique PIN hash across all active users.
--         This prevents two active users from sharing the same 4-digit PIN.
-- ---------------------------------------------------------------------------
create unique index if not exists idx_users_pin_hash_active
  on users (pin_hash)
  where active = true;

-- ---------------------------------------------------------------------------
-- STEP 5: Create the waiter_sessions table for shift tracking / audit.
-- ---------------------------------------------------------------------------
create table if not exists waiter_sessions (
  id               text        primary key,
  waiter_id        text        not null references users(id),
  logged_in_at     timestamptz not null default now(),
  logged_out_at    timestamptz null,
  device_identifier text       null
);

create index if not exists idx_waiter_sessions_waiter
  on waiter_sessions (waiter_id, logged_in_at desc);

-- ---------------------------------------------------------------------------
-- STEP 6: Grant PostgREST access (anon key) to the new table.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on waiter_sessions to anon, authenticated;

-- ---------------------------------------------------------------------------
-- STEP 7: Enable realtime on waiter_sessions.
-- ---------------------------------------------------------------------------
alter table waiter_sessions replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table waiter_sessions;
  end if;
end $$;
