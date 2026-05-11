import { auditRepository } from '../repositories/auditRepository';
import { realtimeAdapter } from '../realtime/realtimeAdapter';
import { supabase } from '../lib/db/supabaseClient';
import { createSubscriptionController } from './subscriptionController';

export const auditService = {
  async log(payload) {
    await auditRepository.create(payload);
  },

  async listRecent(limit = 200) {
    return auditRepository.listRecent(limit);
  },

  async listByDate({ fromDate, toDate } = {}) {
    let q = supabase.from('audit_logs').select('*');
    if (fromDate) q = q.gte('created_at', fromDate);
    if (toDate) q = q.lte('created_at', toDate);
    const { data, error } = await q.order('created_at', { ascending: false }).limit(500);
    if (error) throw error;
    return data || [];
  },

  subscribeRecent(onData) {
    const load = async () => {
      const logs = await this.listRecent(200);
      onData(logs);
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
  subscribeAuditFeed(load) {
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
  },
};
