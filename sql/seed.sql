-- Minimal seed data for local/dev debugging.

-- Legacy compatibility: convert old kitchen role values.
update users set role = 'kitchen_supervisor' where role = 'kitchen';

insert into users (id, role, code, name, phone, pin_hash, active)
values
  ('u_waiter_1', 'waiter', 'W001', 'Waiter One', '9876543201', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', true),
  ('u_captain_1', 'captain', 'C001', 'Captain One', '9876543202', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', true),
  ('u_kitchen_supervisor_1', 'kitchen_supervisor', 'K001', 'Kitchen Supervisor One', '9876543203', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', true),
  ('u_manager_1', 'manager', 'M001', 'Manager One', '9876543204', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', true)
on conflict (id) do nothing;

insert into restaurant_tables (id, table_number, status, current_session_id)
select 'T' || g::text, g, 'available', null
from generate_series(1, 20) g
on conflict (id) do nothing;
