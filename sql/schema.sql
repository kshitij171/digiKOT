-- SQL-first portable schema (Supabase currently hosts this Postgres).



create table if not exists users (

  id text primary key,

  role text not null check (role in ('waiter', 'kitchen_supervisor', 'manager', 'owner')),

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

  check (role in ('waiter', 'kitchen_supervisor', 'manager', 'owner'));



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

  id            text primary key,

  name          text not null,

  category      text not null,

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

  kot_id text null,

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

  bill_status text not null default 'open' check (bill_status in ('open', 'printed', 'void', 'resettled')),

  resettled_by text null references users(id),

  resettled_at timestamptz null,

  original_payment_method text null,

  new_payment_method text null,

  discount_percent numeric(5,2) null,

  discount_applied_by text null references users(id),

  cleared_at timestamptz null,

  items jsonb not null default '[]',

  voided_at timestamptz null,

  created_at timestamptz not null

);



create table if not exists notifications (

  id text primary key,

  target_user_id text not null references users(id),

  session_id text null references table_sessions(id),

  table_number integer null,

  event_type text not null,

  payload_json jsonb null,

  created_at timestamptz not null

);



create table if not exists audit_logs (

  id text primary key,

  actor_user_id text null references users(id),

  action text not null,

  entity_type text not null,

  entity_id text not null,

  after_json jsonb null,

  remarks text null,

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



create table if not exists bill_modification_requests (

  id                     text        primary key,

  bill_id                text        not null references bills(id),

  waiter_id              text        null references users(id),

  waiter_username        text        null,

  table_number           integer     null,

  items_to_remove        jsonb       not null,

  reason                 text        not null,

  status                 text        not null check (status in ('pending', 'approved', 'rejected')) default 'pending',

  requested_at           timestamptz not null default now(),

  reviewed_by_manager_id text        null references users(id),

  reviewed_at            timestamptz null,

  rejection_reason       text        null,

  rejected_at            timestamptz null,

  rejected_by_display_name text      null,

  approved_at            timestamptz null,

  approved_by_display_name text      null

);



create index if not exists idx_bill_mod_requests_status

  on bill_modification_requests (status, requested_at desc);



create index if not exists idx_bills_table_cleared

  on bills (table_number, cleared_at desc)

  where cleared_at is not null;



-- Purge old audit logs, notifications, and closed table sessions (manager Tools tab).

create or replace function public.purge_old_operational_logs(

  p_audit_days integer default 90,

  p_notification_days integer default 30,

  p_closed_session_days integer default 180

)

returns jsonb

language plpgsql

security definer

set search_path = public

as $$

declare

  v_audit_cutoff timestamptz;

  v_notif_cutoff timestamptz;

  v_session_cutoff timestamptz;

  v_audit_deleted bigint;

  v_notif_deleted bigint;

  v_sessions_deleted bigint;

begin

  v_audit_cutoff := now() - make_interval(days => greatest(coalesce(p_audit_days, 90), 1));

  v_notif_cutoff := now() - make_interval(days => greatest(coalesce(p_notification_days, 30), 1));

  v_session_cutoff := now() - make_interval(days => greatest(coalesce(p_closed_session_days, 180), 30));



  delete from audit_logs where created_at < v_audit_cutoff;

  get diagnostics v_audit_deleted = row_count;



  delete from notifications where created_at < v_notif_cutoff;

  get diagnostics v_notif_deleted = row_count;



  delete from table_sessions

  where status = 'closed'

    and closed_at is not null

    and closed_at < v_session_cutoff;

  get diagnostics v_sessions_deleted = row_count;



  return jsonb_build_object(

    'audit_logs_deleted', v_audit_deleted,

    'notifications_deleted', v_notif_deleted,

    'closed_sessions_deleted', v_sessions_deleted,

    'audit_cutoff', v_audit_cutoff,

    'notification_cutoff', v_notif_cutoff,

    'session_cutoff', v_session_cutoff

  );

end;

$$;


