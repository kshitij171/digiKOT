import { dbAdapter } from '../lib/db/dbAdapter';
import { createId } from '../lib/utils/id';

export const notificationRepository = {
  async create(payload) {
    return dbAdapter.insert('notifications', {
      id: createId(),
      ...payload,
      created_at: new Date().toISOString(),
    });
  },

  async listByUser(userId) {
    return dbAdapter.select('notifications', {
      filters: [{ column: 'target_user_id', value: userId }],
      orderBy: 'created_at',
      ascending: false,
      limit: 200,
    });
  },
};
