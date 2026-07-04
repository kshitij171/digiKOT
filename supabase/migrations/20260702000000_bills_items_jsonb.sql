-- Denormalize bill_items into bills.items (jsonb array of line snapshots).

ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS items jsonb NOT NULL DEFAULT '[]';

UPDATE bills b
SET items = COALESCE(
  (
    SELECT jsonb_agg(
      jsonb_strip_nulls(
        jsonb_build_object(
          'kot_item_id', bi.kot_item_id,
          'item_name', bi.item_name,
          'qty', bi.qty,
          'unit_price', bi.unit_price,
          'line_total', bi.line_total,
          'include_in_bill', bi.include_in_bill,
          'exclusion_reason', bi.exclusion_reason,
          'removed_qty', bi.removed_qty,
          'original_qty', bi.original_qty
        )
      )
      ORDER BY bi.id
    )
    FROM bill_items bi
    WHERE bi.bill_id = b.id
  ),
  '[]'::jsonb
)
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bill_items');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER publication supabase_realtime DROP TABLE bill_items;
    EXCEPTION
      WHEN undefined_object THEN NULL;
      WHEN undefined_table THEN NULL;
    END;
  END IF;
END $$;

DROP TABLE IF EXISTS bill_items CASCADE;

NOTIFY pgrst, 'reload schema';
