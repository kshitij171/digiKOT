-- Migration: add supervisor ownership columns to kots
-- supervisor_id, supervisor_name, assigned_at track first-touch ownership
-- by a kitchen supervisor (set once on the first action they take on a KOT)

ALTER TABLE kots
  ADD COLUMN IF NOT EXISTS supervisor_id   TEXT        NULL REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS supervisor_name VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS assigned_at     TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_kots_supervisor
  ON kots (supervisor_id)
  WHERE supervisor_id IS NOT NULL;
