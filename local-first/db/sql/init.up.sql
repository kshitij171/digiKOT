-- Local-first schema: core KOT domain + app notifications + devices + MQTT outbox.
-- Single-tenant default restaurant id: 'default'

create table if not exists restaurants (
  id text primary key
);

insert into restaurants (id) values ('default') on conflict do nothing;

create table if not exists users (
  id text primary key,
  restaurant_id text not null references restaurants(id) default 'default',
  role text not null check (role in ('waiter', 'kitchen_supervisor', 'manager')),
  code text not null unique,
  username text not null unique,
  name text not null,
  phone text not null unique,
  pin_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_users_phone_unique on users (phone);
create index if not exists idx_users_role_active on users (role, active);

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

-- App-visible notification history (separate from mqtt_outbox delivery queue).
create table if not exists notifications (
  id text primary key,
  restaurant_id text not null references restaurants(id),
  type text not null,
  target_type text not null,
  target_id text not null,
  title text null,
  message text null,
  payload jsonb null,
  status text not null default 'unread',
  created_at timestamptz not null default now(),
  read_at timestamptz null,
  acknowledged_at timestamptz null
);

create index if not exists idx_notifications_restaurant_created
  on notifications (restaurant_id, created_at desc);

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

create table if not exists devices (
  id text primary key,
  restaurant_id text not null references restaurants(id),
  device_id text not null,
  device_name text not null,
  device_type text not null,
  assigned_role text null,
  assigned_target_id text null,
  mqtt_username text not null unique,
  status text not null default 'offline',
  last_seen_at timestamptz null,
  last_ack_at timestamptz null,
  wifi_rssi integer null,
  created_at timestamptz not null default now(),
  unique (restaurant_id, device_id)
);

create index if not exists idx_devices_restaurant on devices (restaurant_id);
create index if not exists idx_devices_mqtt_username on devices (mqtt_username);

create table if not exists mqtt_outbox (
  id bigserial primary key,
  topic text not null,
  payload text not null,
  status text not null default 'pending' check (status in ('pending', 'published', 'failed')),
  attempt_count integer not null default 0,
  created_at timestamptz not null default now(),
  published_at timestamptz null,
  last_error text null
);

create index if not exists idx_mqtt_outbox_pending on mqtt_outbox (status, created_at)
  where status = 'pending';

create index if not exists idx_kots_table_status_created_at
  on kots (table_number, status, created_at);

create index if not exists idx_kot_items_kot_status
  on kot_items (kot_id, status);

create index if not exists idx_cancel_requests_table_status_requested
  on cancel_requests (table_number, status, requested_at);

create index if not exists idx_audit_logs_created
  on audit_logs (created_at);

create index if not exists idx_menu_items_category_out_of_stock
  on menu_items (category, out_of_stock);
