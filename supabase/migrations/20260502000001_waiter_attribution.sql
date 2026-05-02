-- =============================================================================
-- Migration: Waiter attribution on KOTs and Bills + audit trail tables
-- Run in Supabase Studio SQL editor or: npx supabase db push
-- =============================================================================

-- ---------------------------------------------------------------------------
-- STEP 1: Add waiter_username to kots (denormalized for fast kitchen display).
-- ---------------------------------------------------------------------------
alter table kots add column if not exists waiter_username text null;

-- ---------------------------------------------------------------------------
-- STEP 2: Add waiter_username to bills (denormalized for manager view).
-- ---------------------------------------------------------------------------
alter table bills add column if not exists waiter_username text null;

-- ---------------------------------------------------------------------------
-- STEP 3: KOT actions audit trail.
-- Records every significant action on a KOT: created, modified, cancelled.
-- ---------------------------------------------------------------------------
create table if not exists kot_actions (
  id                     text        primary key,
  kot_id                 text        not null references kots(id) on delete cascade,
  action                 text        not null check (action in ('created', 'modified', 'cancelled')),
  performed_by_waiter_id text        null references users(id),
  performed_at           timestamptz not null default now()
);

create index if not exists idx_kot_actions_kot_id
  on kot_actions (kot_id, performed_at desc);

create index if not exists idx_kot_actions_waiter
  on kot_actions (performed_by_waiter_id, performed_at desc);

-- ---------------------------------------------------------------------------
-- STEP 4: Bill modification requests (foundation for Phase 3).
-- A waiter can request that specific items be removed from a printed bill.
-- The manager approves or rejects; the bill is NOT modified until approved.
-- ---------------------------------------------------------------------------
create table if not exists bill_modification_requests (
  id                    text        primary key,
  bill_id               text        not null references bills(id),
  waiter_id             text        null references users(id),
  waiter_username       text        null,
  items_to_remove       jsonb       not null,
  reason                text        not null,
  status                text        not null check (status in ('pending', 'approved', 'rejected')) default 'pending',
  requested_at          timestamptz not null default now(),
  reviewed_by_manager_id text       null references users(id),
  reviewed_at           timestamptz null
);

create index if not exists idx_bill_mod_requests_bill
  on bill_modification_requests (bill_id);

create index if not exists idx_bill_mod_requests_status
  on bill_modification_requests (status, requested_at desc);

-- ---------------------------------------------------------------------------
-- STEP 5: PostgREST grants.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on kot_actions               to anon, authenticated;
grant select, insert, update, delete on bill_modification_requests to anon, authenticated;

-- ---------------------------------------------------------------------------
-- STEP 6: Realtime — kitchen + manager can subscribe to these tables.
-- ---------------------------------------------------------------------------
alter table kot_actions               replica identity full;
alter table bill_modification_requests replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table kot_actions;
    alter publication supabase_realtime add table bill_modification_requests;
  end if;
end $$;
