import { auditRepository } from '../repositories/auditRepository';
import { realtimeAdapter } from '../realtime/realtimeAdapter';
import { supabase } from '../lib/db/supabaseClient';
import { createSubscriptionController } from './subscriptionController';

export const auditService = {
  /**
   * Writes an audit log entry.
   * @param {object} payload - Insert payload for audit_logs table.
   * @returns {Promise<void>}
   */
  async log(payload) {
    try {
      await auditRepository.create(payload);
    } catch (err) {
      throw err;
    }
  },

  /**
   * Lists recent audit logs.
   * @param {number} [limit=200] - Max rows to return.
   * @returns {Promise<Array<object>>}
   */
  async listRecent(limit = 200) {
    try {
      return auditRepository.listRecent(limit);
    } catch (err) {
      throw err;
    }
  },

  /**
   * Lists audit logs within a date range (inclusive).
   * @param {object} [args]
   * @param {string|null} [args.fromDate] - ISO timestamp lower bound.
   * @param {string|null} [args.toDate] - ISO timestamp upper bound.
   * @returns {Promise<Array<object>>}
   */
  async listByDate({ fromDate, toDate } = {}) {
    try {
      let q = supabase.from('audit_logs').select('*');
      if (fromDate) q = q.gte('created_at', fromDate);
      if (toDate) q = q.lte('created_at', toDate);
      const { data, error } = await q.order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      return data || [];
    } catch (err) {
      throw err;
    }
  },

  /**
   * Subscribes to recent audit logs and invokes callback with updates.
   * @param {(rows: Array<object>) => void} onData
   * @returns {() => void} Cleanup function.
   */
  subscribeRecent(onData) {
    const load = async () => {
      try {
        const logs = await this.listRecent(200);
        onData(logs);
      } catch (err) {
        throw err;
      }
    };
    return createSubscriptionController({
      load,
      subscribeFns: [
        (onEvent, onStatus) =>
          realtimeAdapter.subscribe({
            channelName: 'audit-watch',
            table: 'audit_logs',
            onEvent,
            onStatus,
          }),
      ],
    });
  },

  /** Reload callback whenever `audit_logs` changes (for live audit feed). */
  /**
   * Subscribes to audit feed changes and triggers the provided loader callback.
   * @param {() => Promise<void>} load - Loader invoked on subscription events.
   * @returns {() => void} Cleanup function.
   */
  subscribeAuditFeed(load) {
    try {
      return createSubscriptionController({
        load,
        subscribeFns: [
          (onEvent, onStatus) =>
            realtimeAdapter.subscribe({
              channelName: 'audit-feed-live',
              table: 'audit_logs',
              onEvent,
              onStatus,
            }),
        ],
      });
    } catch (err) {
      throw err;
    }
  },
};
