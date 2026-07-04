-- Drop write-only / redundant tables, slim unused columns, add log retention RPC.

-- ── Dead tables ─────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS kot_actions CASCADE;
DROP TABLE IF EXISTS postprep_adjustments CASCADE;
DROP TABLE IF EXISTS waiter_sessions CASCADE;

-- ── Menu: text category only (categories table unused at runtime) ─────────────
ALTER TABLE menu_items DROP COLUMN IF EXISTS category_id;
DROP INDEX IF EXISTS idx_menu_items_category_id;
DROP TABLE IF EXISTS categories CASCADE;

-- ── Unused bill / kot columns ────────────────────────────────────────────────
ALTER TABLE bills DROP COLUMN IF EXISTS printed;
ALTER TABLE bills DROP COLUMN IF EXISTS discount_applied_at;
ALTER TABLE bills DROP COLUMN IF EXISTS voided_by;
ALTER TABLE bills DROP COLUMN IF EXISTS void_reason;

ALTER TABLE kots DROP COLUMN IF EXISTS indent_received_at;
ALTER TABLE kots DROP COLUMN IF EXISTS indent_received_by;
DROP INDEX IF EXISTS idx_kots_indent_received;

ALTER TABLE audit_logs DROP COLUMN IF EXISTS before_json;
ALTER TABLE notifications DROP COLUMN IF EXISTS read_at;

-- ── Slim bill_modification_requests (items_to_remove jsonb is canonical) ─────
ALTER TABLE bill_modification_requests
  DROP COLUMN IF EXISTS waiter_name,
  DROP COLUMN IF EXISTS approved_by,
  DROP COLUMN IF EXISTS approved_reason,
  DROP COLUMN IF EXISTS rejected_by,
  DROP COLUMN IF EXISTS approval_note,
  DROP COLUMN IF EXISTS removal_qty,
  DROP COLUMN IF EXISTS remaining_qty,
  DROP COLUMN IF EXISTS item_name,
  DROP COLUMN IF EXISTS original_qty,
  DROP COLUMN IF EXISTS final_qty,
  DROP COLUMN IF EXISTS removed_qty,
  DROP COLUMN IF EXISTS kot_id,
  DROP COLUMN IF EXISTS item_id;

-- ── Retention: purge old audit logs, notifications, closed sessions ─────────
CREATE OR REPLACE FUNCTION public.purge_old_operational_logs(
  p_audit_days integer DEFAULT 90,
  p_notification_days integer DEFAULT 30,
  p_closed_session_days integer DEFAULT 180
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audit_cutoff timestamptz;
  v_notif_cutoff timestamptz;
  v_session_cutoff timestamptz;
  v_audit_deleted bigint;
  v_notif_deleted bigint;
  v_sessions_deleted bigint;
BEGIN
  v_audit_cutoff := now() - make_interval(days => greatest(coalesce(p_audit_days, 90), 1));
  v_notif_cutoff := now() - make_interval(days => greatest(coalesce(p_notification_days, 30), 1));
  v_session_cutoff := now() - make_interval(days => greatest(coalesce(p_closed_session_days, 180), 30));

  DELETE FROM audit_logs WHERE created_at < v_audit_cutoff;
  GET DIAGNOSTICS v_audit_deleted = ROW_COUNT;

  DELETE FROM notifications WHERE created_at < v_notif_cutoff;
  GET DIAGNOSTICS v_notif_deleted = ROW_COUNT;

  DELETE FROM table_sessions
  WHERE status = 'closed'
    AND closed_at IS NOT NULL
    AND closed_at < v_session_cutoff;
  GET DIAGNOSTICS v_sessions_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'audit_logs_deleted', v_audit_deleted,
    'notifications_deleted', v_notif_deleted,
    'closed_sessions_deleted', v_sessions_deleted,
    'audit_cutoff', v_audit_cutoff,
    'notification_cutoff', v_notif_cutoff,
    'session_cutoff', v_session_cutoff
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_operational_logs(integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_old_operational_logs(integer, integer, integer) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
