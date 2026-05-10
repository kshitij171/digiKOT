-- Soft-delete support for staff: required by userRepository listUsers / softDelete.
alter table users
  add column if not exists deleted_at timestamptz default null;

create index if not exists idx_users_deleted_at on users (deleted_at) where deleted_at is not null;
