-- Extend pager_devices with provisioning / liveness fields for install setup + bridge.

alter table pager_devices
  add column if not exists provision_state text not null default 'offline',
  add column if not exists last_ip text,
  add column if not exists last_seen_at timestamptz,
  add column if not exists firmware_version text;

alter table pager_devices
  drop constraint if exists pager_devices_provision_state_check;

alter table pager_devices
  add constraint pager_devices_provision_state_check
  check (provision_state in (
    'on_root',
    'push_pending',
    'on_restaurant_wifi',
    'mqtt_ok',
    'wifi_failed',
    'offline'
  ));

create index if not exists idx_pager_devices_provision_state
  on pager_devices (provision_state);
