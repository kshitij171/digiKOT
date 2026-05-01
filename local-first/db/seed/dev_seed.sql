-- Dev seed (SHA256 of '1234' for pin_hash — change in production).
insert into users (id, restaurant_id, role, code, name, phone, pin_hash, active)
values
  ('u_waiter_1', 'default', 'waiter', 'W001', 'Waiter One', '9876543201', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', true),
  ('u_captain_1', 'default', 'captain', 'C001', 'Captain One', '9876543202', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', true),
  ('u_kitchen_supervisor_1', 'default', 'kitchen_supervisor', 'K001', 'Kitchen Supervisor One', '9876543203', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', true),
  ('u_manager_1', 'default', 'manager', 'M001', 'Manager One', '9876543204', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', true)
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
