-- =============================================================================
-- Pager pool: device inventory (device_code + MAC) + waiter assignments
-- =============================================================================

create table if not exists pager_devices (
  device_code   text primary key,
  label         text not null,
  mac_address   text not null,
  display_order integer not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint pager_devices_mac_format check (mac_address ~ '^([0-9A-F]{2}:){5}[0-9A-F]{2}$')
);

create unique index if not exists idx_pager_devices_mac_address
  on pager_devices (mac_address);

create table if not exists pager_assignments (
  id               text primary key,
  pager_device_id  text not null references pager_devices (device_code) on delete restrict,
  waiter_user_id   text not null references users (id) on delete restrict,
  assigned_at      timestamptz not null,
  released_at      timestamptz null
);

create index if not exists idx_pager_assignments_waiter_released
  on pager_assignments (waiter_user_id, released_at);

create unique index if not exists idx_pager_assignments_one_active_per_pager
  on pager_assignments (pager_device_id)
  where released_at is null;

create unique index if not exists idx_pager_assignments_one_active_per_waiter
  on pager_assignments (waiter_user_id)
  where released_at is null;

-- Bridge: ordered cursor over (created_at, id) without missing same-timestamp rows
create or replace function public.fetch_notifications_after(
  p_after_ts timestamptz,
  p_after_id text,
  p_limit int default 50
)
returns setof notifications
language sql
stable
security invoker
set search_path = public
as $$
  select n.*
  from public.notifications n
  where (n.created_at > p_after_ts)
     or (n.created_at = p_after_ts and n.id > p_after_id)
  order by n.created_at asc, n.id asc
  limit least(coalesce(nullif(p_limit, 0), 50), 200);
$$;

revoke all on function public.fetch_notifications_after(timestamptz, text, int) from public;
grant execute on function public.fetch_notifications_after(timestamptz, text, int) to service_role;

grant select, insert, update, delete on pager_devices, pager_assignments to anon, authenticated;

alter table pager_devices replica identity full;
alter table pager_assignments replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table pager_devices;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table pager_assignments;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- Example provisioning (Supabase SQL editor). MAC must match uppercase hex AA:BB:... pattern.
-- insert into pager_devices (device_code, label, mac_address, display_order) values
--   ('pager_1', 'Pager 1', 'AA:BB:CC:DD:EE:01', 1),
--   ('pager_2', 'Pager 2', 'AA:BB:CC:DD:EE:02', 2);
