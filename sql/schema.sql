-- SQL-first portable schema (Supabase currently hosts this Postgres).

create table if not exists users (
  id text primary key,
  role text not null check (role in ('waiter', 'kitchen_supervisor', 'manager')),
  code text not null unique,
  username text null,
  name text not null,
  phone text not null unique,
  pin_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table users add column if not exists phone text;
alter table users add column if not exists updated_at timestamptz not null default now();
update users set role = 'kitchen_supervisor' where role = 'kitchen';
update users set phone = '000' || right(code, 7) where phone is null;
alter table users alter column phone set not null;
create unique index if not exists idx_users_phone_unique on users (phone);

alter table users drop constraint if exists users_role_check;
alter table users
  add constraint users_role_check
  check (role in ('waiter', 'kitchen_supervisor', 'manager'));

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

create table if not exists categories (
  id            text primary key,
  name          text not null unique,
  display_order integer not null default 0,
  icon          text null
);

create table if not exists menu_items (
  id            text primary key,
  name          text not null,
  category      text not null,
  category_id   text null references categories(id),
  price         numeric(10,2) not null,
  description   text null,
  image_url     text null,
  is_vegetarian boolean not null default false,
  out_of_stock  boolean not null default false,
  updated_at    timestamptz not null default now()
);

create table if not exists kots (
  id text primary key,
  session_id text null references table_sessions(id),
  table_number integer not null,
  waiter_user_id text null references users(id),
  waiter_username text null,
  special_instructions text null,
  status text not null check (status in ('open', 'cleared', 'cancelled')),
  created_at timestamptz not null,
  cleared_at timestamptz null,
  updated_at timestamptz not null,
  -- Indent tracking
  indent_received_at timestamptz null,
  indent_received_by text null references users(id),
  -- Cancellation tracking
  cancelled_by text null references users(id),
  cancelled_at timestamptz null,
  cancel_reason text null
);

create table if not exists kot_items (
  id text primary key,
  kot_id text not null references kots(id) on delete cascade,
  menu_item_id text not null references menu_items(id),
  item_name_snapshot text not null,
  qty integer not null,
  price_snapshot numeric(10,2) not null,
  image_url text null,
  removed_qty integer null,
  final_qty integer null,
  status text not null check (
    status in (
      'pending',
      'done',
      'out_of_stock',
      'cancelled',
      'removed',
      'partially_removed',
      'removed_entirely'
    )
  ),
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
  waiter_username text null,
  subtotal numeric(10,2) not null,
  service_charge numeric(10,2) not null,
  tax numeric(10,2) not null,
  total numeric(10,2) not null,
  printed boolean not null default false,
  bill_status text not null default 'open' check (bill_status in ('open', 'printed', 'void', 'resettled')),
  -- Void tracking
  voided_by text null references users(id),
  voided_at timestamptz null,
  void_reason text null,
  -- Resettle tracking
  resettled_by text null references users(id),
  resettled_at timestamptz null,
  original_payment_method text null,
  new_payment_method text null,
  -- Discount tracking
  discount_percent numeric(5,2) null,
  discount_applied_by text null references users(id),
  discount_applied_at timestamptz null,
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

create unique index if not exists idx_users_username
  on users (username)
  where username is not null;

create unique index if not exists idx_users_pin_hash_active
  on users (pin_hash)
  where active = true;

create table if not exists waiter_sessions (
  id               text        primary key,
  waiter_id        text        not null references users(id),
  logged_in_at     timestamptz not null default now(),
  logged_out_at    timestamptz null,
  device_identifier text       null
);

create index if not exists idx_waiter_sessions_waiter
  on waiter_sessions (waiter_id, logged_in_at desc);

create table if not exists kot_actions (
  id                     text        primary key,
  kot_id                 text        not null references kots(id) on delete cascade,
  action                 text        not null check (action in ('created', 'modified', 'cancelled')),
  performed_by_waiter_id text        null references users(id),
  performed_at           timestamptz not null default now()
);

create index if not exists idx_kot_actions_kot_id
  on kot_actions (kot_id, performed_at desc);

create table if not exists bill_modification_requests (
  id                     text        primary key,
  bill_id                text        not null references bills(id),
  waiter_id              text        null references users(id),
  waiter_username        text        null,
  waiter_name            varchar(100) null,
  table_number           integer     null,
  items_to_remove        jsonb       not null,
  reason                 text        not null,
  status                 text        not null check (status in ('pending', 'approved', 'rejected')) default 'pending',
  requested_at           timestamptz not null default now(),
  reviewed_by_manager_id text        null references users(id),
  reviewed_at            timestamptz null,
  rejection_reason       text        null,
  rejected_at            timestamptz null,
  rejected_by            varchar(100) null,
  rejected_by_display_name text      null,
  approved_at            timestamptz null,
  approved_by            varchar(100) null,
  approved_reason        text        null,
  approved_by_display_name text      null,
  approval_note          text        null,
  removal_qty            integer     null,
  remaining_qty          integer     null,
  item_name              varchar(255) null,
  original_qty           integer     null,
  final_qty              integer     null,
  removed_qty            integer     null,
  kot_id                 text        null,
  item_id                varchar(100) null
);

create index if not exists idx_bill_mod_requests_status
  on bill_modification_requests (status, requested_at desc);
