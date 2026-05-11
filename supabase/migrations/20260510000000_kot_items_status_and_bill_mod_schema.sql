-- ============================================================================
-- Schema fixes: kot_items status CHECK + bill_modification_requests columns +
-- status CHECK. Reload PostgREST schema cache for Supabase API.
--
-- Codebase write audit (repositories only):
-- kot_items.status set to:
--   pending, done, out_of_stock, cancelled, removed (kotRepository RESOLVED / kitchen),
--   partially_removed, removed_entirely (kotRepository.applyPartialRemoval)
-- bill_modification_requests: billModificationRepository insert/update fields
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ERROR 1 — kot_items: allow partial / full removal statuses.
-- Includes legacy 'removed' (kitchen / historical rows); app also uses
-- partially_removed, removed_entirely.
-- ---------------------------------------------------------------------------

ALTER TABLE kot_items DROP CONSTRAINT IF EXISTS kot_items_status_check;

ALTER TABLE kot_items
  ADD CONSTRAINT kot_items_status_check
  CHECK (
    status IN (
      'pending',
      'done',
      'out_of_stock',
      'cancelled',
      'removed',
      'partially_removed',
      'removed_entirely'
    )
  );

-- ---------------------------------------------------------------------------
-- ERROR 2 — bill_modification_requests: denormalized + audit columns
-- (Waiter id stays TEXT — references users.id; do not add INTEGER waiter_id.)
-- ---------------------------------------------------------------------------

ALTER TABLE bill_modification_requests
  DROP CONSTRAINT IF EXISTS bill_modification_requests_status_check;

ALTER TABLE bill_modification_requests
  ADD CONSTRAINT bill_modification_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

ALTER TABLE bill_modification_requests
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS rejected_by varchar(100) NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason text NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS approved_by varchar(100) NULL,
  ADD COLUMN IF NOT EXISTS approved_reason text NULL,
  ADD COLUMN IF NOT EXISTS removal_qty integer NULL,
  ADD COLUMN IF NOT EXISTS remaining_qty integer NULL,
  ADD COLUMN IF NOT EXISTS item_name varchar(255) NULL,
  ADD COLUMN IF NOT EXISTS original_qty integer NULL,
  ADD COLUMN IF NOT EXISTS final_qty integer NULL,
  ADD COLUMN IF NOT EXISTS removed_qty integer NULL,
  ADD COLUMN IF NOT EXISTS table_number integer NULL,
  ADD COLUMN IF NOT EXISTS waiter_name varchar(100) NULL,
  ADD COLUMN IF NOT EXISTS kot_id text NULL,
  ADD COLUMN IF NOT EXISTS item_id varchar(100) NULL,
  ADD COLUMN IF NOT EXISTS approved_by_display_name text NULL,
  ADD COLUMN IF NOT EXISTS approval_note text NULL,
  ADD COLUMN IF NOT EXISTS rejected_by_display_name text NULL;

-- Supabase PostgREST: refresh schema cache so new columns appear in API
NOTIFY pgrst, 'reload schema';
