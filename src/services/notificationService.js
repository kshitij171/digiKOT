import { notificationRepository } from '../repositories/notificationRepository';
import { realtimeAdapter } from '../realtime/realtimeAdapter';
import { createSubscriptionController } from './subscriptionController';

export const notificationService = {
  /**
   * Creates a notification record for a target user.
   * @param {object} payload - Insert payload for notifications table.
   * @returns {Promise<void>}
   */
  async createNotification(payload) {
    try {
      await notificationRepository.create(payload);
    } catch (err) {
      throw err;
    }
  },

  /**
   * Lists recent notifications for a user (most recent first).
   * @param {string} userId - Target user id.
   * @returns {Promise<Array<object>>}
   */
  async listForUser(userId) {
    try {
      return notificationRepository.listByUser(userId);
    } catch (err) {
      throw err;
    }
  },

  /**
   * Subscribes to notifications changes for a user and streams updates to a callback.
   * @param {string} userId - Target user id.
   * @param {(rows: Array<object>) => void} onData - Callback invoked with latest rows.
   * @returns {() => void} Unsubscribe/cleanup function.
   */
  subscribeForUser(userId, onData) {
    const load = async () => {
      try {
        const items = await this.listForUser(userId);
        onData(items);
      } catch (err) {
        throw err;
      }
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
