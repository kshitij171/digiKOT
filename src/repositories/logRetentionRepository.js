import { supabase } from '../lib/db/supabaseClient';

export const logRetentionRepository = {
  /**
   * Deletes audit_logs, notifications, and closed table_sessions older than retention windows.
   * @param {object} [args]
   * @param {number} [args.auditDays=90]
   * @param {number} [args.notificationDays=30]
   * @param {number} [args.closedSessionDays=180]
   * @returns {Promise<object>}
   */
  async purge({
    auditDays = 90,
    notificationDays = 30,
    closedSessionDays = 180,
  } = {}) {
    try {
      const { data, error } = await supabase.rpc('purge_old_operational_logs', {
        p_audit_days: auditDays,
        p_notification_days: notificationDays,
        p_closed_session_days: closedSessionDays,
      });
      if (error) throw error;
      return data || {};
    } catch (err) {
      throw err;
    }
  },
};
