import { dbAdapter } from '../lib/db/dbAdapter';
import { createId } from '../lib/utils/id';

export const notificationRepository = {
  /**
   * Inserts a notification row.
   * @param {object} payload
   * @returns {Promise<any>}
   */
  async create(payload) {
    try {
      return dbAdapter.insert('notifications', {
        id: createId(),
        ...payload,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Lists notifications for a user (most recent first).
   * @param {string} userId
   * @returns {Promise<Array<object>>}
   */
  async listByUser(userId) {
    try {
      return dbAdapter.select('notifications', {
        filters: [{ column: 'target_user_id', value: userId }],
        orderBy: 'created_at',
        ascending: false,
        limit: 200,
      });
    } catch (err) {
      throw err;
    }
  },
};
