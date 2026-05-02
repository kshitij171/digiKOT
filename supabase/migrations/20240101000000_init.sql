-- =============================================================================
-- KOT System — initial schema migration
-- Compatible with: Supabase local dev (npx supabase start)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLES
-- ---------------------------------------------------------------------------

create table if not exists users (
  id text primary key,
  role text not null check (role in ('waiter', 'captain', 'kitchen_supervisor', 'manager')),
  code text not null unique,
  name text not null,
  phone text not null unique,
  pin_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists restaurant_tables (
  id text primary key,
  table_number integer not null unique,
  status text not null check (status in ('available', 'occupied')),
  current_session_id text null,
  updated_at timestamptz not null default now()
);

create table if not exists table_sessions (
  id text primary key,
  table_number integer not null,
  opened_by_user_id text not null references users(id),
  status text not null check (status in ('active', 'closed')),
  opened_at timestamptz not null,
  closed_at timestamptz null
);

create table if not exists menu_items (
  id text primary key,
  name text not null,
  category text not null,
  price numeric(10,2) not null,
  description text null,
  image_url text null,
  out_of_stock boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists kots (
  id text primary key,
  session_id text null references table_sessions(id),
  table_number integer not null,
  waiter_user_id text null references users(id),
  special_instructions text null,
  status text not null check (status in ('open', 'cleared')),
  created_at timestamptz not null,
  cleared_at timestamptz null,
  updated_at timestamptz not null
);

create table if not exists kot_items (
  id text primary key,
  kot_id text not null references kots(id) on delete cascade,
  menu_item_id text not null references menu_items(id),
  item_name_snapshot text not null,
  qty integer not null,
  price_snapshot numeric(10,2) not null,
  image_url text null,
  status text not null check (status in ('pending', 'done', 'out_of_stock', 'cancelled', 'removed')),
  updated_at timestamptz not null
);

create table if not exists cancel_requests (
  id text primary key,
  kot_id text not null references kots(id) on delete cascade,
  kot_item_id text not null,
  table_number integer not null,
  waiter_user_id text null references users(id),
  item_name text not null,
  qty integer not null,
  reason text null,
  status text not null check (status in ('pending_approval', 'approved', 'rejected')),
  requested_at timestamptz not null,
  reviewed_by_user_id text null references users(id),
  reviewed_at timestamptz null
);

create table if not exists bills (
  id text primary key,
  session_id text null references table_sessions(id),
  table_number integer not null,
  waiter_user_id text null references users(id),
  subtotal numeric(10,2) not null,
  service_charge numeric(10,2) not null,
  tax numeric(10,2) not null,
  total numeric(10,2) not null,
  printed boolean not null default false,
  created_at timestamptz not null
);

create table if not exists bill_items (
  id text primary key,
  bill_id text not null references bills(id) on delete cascade,
  kot_item_id text null,
  item_name text not null,
  qty integer not null,
  unit_price numeric(10,2) not null,
  line_total numeric(10,2) not null,
  include_in_bill boolean not null default true,
  exclusion_reason text null
);

create table if not exists notifications (
  id text primary key,
  target_user_id text not null references users(id),
  session_id text null references table_sessions(id),
  table_number integer null,
  event_type text not null,
  payload_json jsonb null,
  read_at timestamptz null,
  created_at timestamptz not null
);

create table if not exists audit_logs (
  id text primary key,
  actor_user_id text null references users(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before_json jsonb null,
  after_json jsonb null,
  remarks text null,
  created_at timestamptz not null
);

create table if not exists postprep_adjustments (
  id text primary key,
  session_id text null references table_sessions(id),
  table_number integer not null,
  kot_item_id text not null,
  requested_by_waiter_id text not null references users(id),
  approved_by_manager_id text not null references users(id),
  reason text not null,
  action text not null,
  created_at timestamptz not null
);

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------

create index if not exists idx_kots_table_status_created_at
  on kots (table_number, status, created_at);

create index if not exists idx_kot_items_kot_status
  on kot_items (kot_id, status);

create index if not exists idx_cancel_requests_table_status_requested
  on cancel_requests (table_number, status, requested_at);

create index if not exists idx_notifications_target_created
  on notifications (target_user_id, created_at);

create index if not exists idx_audit_logs_created
  on audit_logs (created_at);

create index if not exists idx_menu_items_category_out_of_stock
  on menu_items (category, out_of_stock);

create index if not exists idx_users_role_active
  on users (role, active);

-- ---------------------------------------------------------------------------
-- POSTGREST ACCESS GRANTS
-- The app uses the `anon` key for all operations (no Supabase Auth JWT).
-- Grant full access to the anon and authenticated roles so that PostgREST
-- can proxy all table reads/writes from the frontend.
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on
  users,
  restaurant_tables,
  table_sessions,
  menu_items,
  kots,
  kot_items,
  cancel_requests,
  bills,
  bill_items,
  notifications,
  audit_logs,
  postprep_adjustments
to anon, authenticated;

-- ---------------------------------------------------------------------------
-- SUPABASE REALTIME
-- The frontend subscribes to postgres_changes on these tables.
-- REPLICA IDENTITY FULL ensures the old record values are published (needed
-- for UPDATE and DELETE events to carry the full row in the payload).
-- ---------------------------------------------------------------------------

alter table kots              replica identity full;
alter table kot_items         replica identity full;
alter table menu_items        replica identity full;
alter table restaurant_tables replica identity full;
alter table table_sessions    replica identity full;
alter table notifications     replica identity full;
alter table cancel_requests   replica identity full;
alter table audit_logs        replica identity full;

-- Add all watched tables to the realtime publication.
-- The supabase_realtime publication is created automatically by the
-- Supabase local stack; we just add tables to it.
do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table
  kots,
  kot_items,
  menu_items,
  restaurant_tables,
  table_sessions,
  notifications,
  cancel_requests,
  audit_logs;
