-- Add Owner as a first-class staff role.
-- Owner shares the manager dashboard and permissions at the application layer.

alter table users drop constraint if exists users_role_check;
alter table users
  add constraint users_role_check
  check (role in ('waiter', 'kitchen_supervisor', 'manager', 'owner'));
