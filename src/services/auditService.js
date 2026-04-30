import { auditRepository } from '../repositories/auditRepository';
import { realtimeAdapter } from '../realtime/realtimeAdapter';
import { createSubscriptionController } from './subscriptionController';

export const auditService = {
  async log(payload) {
    await auditRepository.create(payload);
  },

  async listRecent(limit = 200) {
    return auditRepository.listRecent(limit);
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
};
