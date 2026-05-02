-- Dev seed (unique PINs per user — required by idx_users_pin_hash_active).
-- waiter1 → 1234, waiter2 → 5678, ksup1 → 9999, mgr1 → 4321
insert into users (id, restaurant_id, role, code, username, name, phone, pin_hash, active)
values
  ('u_waiter_1',             'default', 'waiter',             'W001', 'waiter1', 'Waiter One',             '9876543201', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', true),
  ('u_waiter_2',             'default', 'waiter',             'W002', 'waiter2', 'Waiter Two',             '9876543205', 'f8638b979b2f4f793ddb6dbd197e0ee25a7a6ea32b0ae22f5e3c5d119d839e75', true),
  ('u_kitchen_supervisor_1', 'default', 'kitchen_supervisor', 'K001', 'ksup1',   'Kitchen Supervisor One', '9876543203', '888df25ae35772424a560c7152a1de794440e0ea5cfee62828333a456a506e05', true),
  ('u_manager_1',            'default', 'manager',            'M001', 'mgr1',    'Manager One',            '9876543204', 'fe2592b42a727e977f055947385b709cc82b16b9a87f88c6abf3900d65d0cdc3', true)
on conflict (id) do nothing;

insert into restaurant_tables (id, table_number, status, current_session_id)
select 'T' || g::text, g, 'available', null
from generate_series(1, 20) g
on conflict (id) do nothing;

-- Example device row for MQTT ACL / testing (mqtt user esp_waiter_1).
insert into devices (
  id, restaurant_id, device_id, device_name, device_type,
  assigned_role, assigned_target_id, mqtt_username, status
)
values (
  'd_esp_waiter_1', 'default', 'esp-waiter-1', 'Waiter notifier 1', 'waiter_notifier',
  'waiter', 'u_waiter_1', 'esp_waiter_1', 'offline'
)
on conflict (restaurant_id, device_id) do nothing;
