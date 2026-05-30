-- Cancellation requests are permanent audit records for the manager Cancelled KOTs tab.
-- Clearing a table deletes cleared KOT rows; do not cascade-delete cancel_requests.

alter table cancel_requests
  drop constraint if exists cancel_requests_kot_id_fkey;

alter table cancel_requests
  alter column kot_id drop not null;

comment on column cancel_requests.kot_id is
  'Historical KOT id at request time; row may outlive deleted kots rows.';
