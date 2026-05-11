-- One-time repair: fill missing bill_items.item_name from kot_items snapshot.
-- Run in Supabase SQL editor or: psql ... -f sql/repair_bill_item_names.sql
-- Safe to re-run (only updates rows with empty item_name).

UPDATE bill_items bi
SET item_name = ki.item_name_snapshot
FROM kot_items ki
WHERE bi.kot_item_id = ki.kot_id || ':' || ki.menu_item_id
  AND ki.item_name_snapshot IS NOT NULL
  AND trim(ki.item_name_snapshot) <> ''
  AND (bi.item_name IS NULL OR trim(bi.item_name) = '');
