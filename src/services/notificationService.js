import { notificationRepository } from '../repositories/notificationRepository';
import { realtimeAdapter } from '../realtime/realtimeAdapter';
import { createSubscriptionController } from './subscriptionController';

export const notificationService = {
  async createNotification(payload) {
    await notificationRepository.create(payload);
  },

  async listForUser(userId) {
    return notificationRepository.listByUser(userId);
  },

  subscribeForUser(userId, onData) {
    const load = async () => {
      const items = await this.listForUser(userId);
      onData(items);
    };
    return createSubscriptionController({
      load,
      subscribeFns: [
        (onEvent, onStatus) =>
          realtimeAdapter.subscribe({
            channelName: `notifications-${userId}`,
            table: 'notifications',
            filter: `target_user_id=eq.${userId}`,
            onEvent,
            onStatus,
          }),
      ],
    });
  },
};
