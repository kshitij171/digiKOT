-- =============================================================================
-- Migration: Audit dashboard — void bills, indent received, cancellations,
--            discounts, resettlements, and full bill modification request schema.
-- Run in Supabase Studio SQL editor or: npx supabase db push
-- =============================================================================

-- ---------------------------------------------------------------------------
-- BILLS: audit lifecycle columns
-- ---------------------------------------------------------------------------

-- Lifecycle status (distinct from the old `printed` boolean which stays for compat).
alter table bills add column if not exists bill_status text
  not null default 'open'
  check (bill_status in ('open', 'printed', 'void', 'resettled'));

-- Backfill: all previously printed bills → 'printed'
update bills set bill_status = 'printed' where printed = true and bill_status = 'open';

-- Void
alter table bills add column if not exists voided_by   text null references users(id);
alter table bills add column if not exists voided_at   timestamptz null;
alter table bills add column if not exists void_reason text null;

-- Resettle
alter table bills add column if not exists resettled_by              text null references users(id);
alter table bills add column if not exists resettled_at              timestamptz null;
alter table bills add column if not exists original_payment_method   text null;
alter table bills add column if not exists new_payment_method        text null;

-- Discount
alter table bills add column if not exists discount_percent    numeric(5,2) null;
alter table bills add column if not exists discount_applied_by text null references users(id);
alter table bills add column if not exists discount_applied_at timestamptz null;

-- Useful audit indexes
create index if not exists idx_bills_bill_status      on bills (bill_status, created_at desc);
create index if not exists idx_bills_discount_percent on bills (discount_percent) where discount_percent is not null;
create index if not exists idx_bills_voided_at        on bills (voided_at desc)   where voided_at is not null;
create index if not exists idx_bills_resettled_at     on bills (resettled_at desc) where resettled_at is not null;

-- ---------------------------------------------------------------------------
-- KOTS: indent received + cancellation columns
-- ---------------------------------------------------------------------------

alter table kots add column if not exists indent_received_at  timestamptz null;
alter table kots add column if not exists indent_received_by  text null references users(id);

alter table kots add column if not exists cancelled_by   text null references users(id);
alter table kots add column if not exists cancelled_at   timestamptz null;
alter table kots add column if not exists cancel_reason  text null;

-- Extend status check to include 'cancelled'
alter table kots drop constraint if exists kots_status_check;
alter table kots
  add constraint kots_status_check
  check (status in ('open', 'cleared', 'cancelled'));

create index if not exists idx_kots_indent_received   on kots (indent_received_at desc) where indent_received_at is not null;
create index if not exists idx_kots_cancelled_at      on kots (cancelled_at desc)       where cancelled_at is not null;

-- ---------------------------------------------------------------------------
-- BILL MODIFICATION REQUESTS: add missing Phase-3 columns
-- ---------------------------------------------------------------------------

alter table bill_modification_requests
  add column if not exists table_number    integer null;

alter table bill_modification_requests
  add column if not exists rejection_reason text null;

-- Rename reviewed_* → keep as-is (same semantics as actioned_*)
-- Already have: reviewed_by_manager_id, reviewed_at

-- ---------------------------------------------------------------------------
-- GRANTS for new columns (tables already granted; no new tables)
-- ---------------------------------------------------------------------------
-- (No new tables — existing grants on bills, kots, bill_modification_requests cover all new columns.)

-- ---------------------------------------------------------------------------
-- ENSURE REALTIME publication covers existing tables
-- (bill_modification_requests was added in the previous migration)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    -- bills is not yet in the realtime publication; add it so managers can
    -- get live updates when bills are voided / resettled / discounted.
    begin
      alter publication supabase_realtime add table bills;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

alter table bills replica identity full;
