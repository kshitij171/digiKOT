-- Rejection snapshot (name + time) for audit and waiter display

ALTER TABLE bill_modification_requests
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz null,
  ADD COLUMN IF NOT EXISTS rejected_by_display_name text null;

COMMENT ON COLUMN bill_modification_requests.rejected_at IS 'Set when status = rejected (mirrors review moment)';
COMMENT ON COLUMN bill_modification_requests.rejected_by_display_name IS 'Manager display name at rejection time';
