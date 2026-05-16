-- Manager bills tab: finalized when waiter clears table

ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS cleared_at timestamptz NULL;

ALTER TABLE bill_items
  ADD COLUMN IF NOT EXISTS removed_qty integer NULL,
  ADD COLUMN IF NOT EXISTS original_qty integer NULL;

CREATE INDEX IF NOT EXISTS idx_bills_table_cleared
  ON bills (table_number, cleared_at DESC)
  WHERE cleared_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
