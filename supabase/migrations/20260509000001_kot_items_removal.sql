-- Migration: track partial/full removal on individual kot_items
-- removed_qty  — how many units the manager approved removing
-- final_qty    — effective billed quantity after removal (original - removed_qty)
-- status values added: 'partially_removed', 'removed_entirely'

ALTER TABLE kot_items
  ADD COLUMN IF NOT EXISTS removed_qty INTEGER NULL,
  ADD COLUMN IF NOT EXISTS final_qty   INTEGER NULL;
