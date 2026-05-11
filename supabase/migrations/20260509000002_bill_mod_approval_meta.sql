-- Denormalized manager attribution on approval (waiter summary + audit)

ALTER TABLE bill_modification_requests
  ADD COLUMN IF NOT EXISTS approved_by_display_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS approval_note TEXT NULL;

COMMENT ON COLUMN bill_modification_requests.approved_by_display_name IS 'Manager name at approval time';
COMMENT ON COLUMN bill_modification_requests.approval_note IS 'Optional note when approving';
