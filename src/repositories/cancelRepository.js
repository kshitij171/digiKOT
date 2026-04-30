import { dbAdapter } from '../lib/db/dbAdapter';
import { createId } from '../lib/utils/id';

export const cancelRepository = {
  async listByTable(tableNumber) {
    return dbAdapter.select('cancel_requests', {
      filters: [{ column: 'table_number', value: tableNumber }],
      orderBy: 'requested_at',
      ascending: false,
    });
  },

  async listPending() {
    return dbAdapter.select('cancel_requests', {
      filters: [{ column: 'status', value: 'pending_approval' }],
      orderBy: 'requested_at',
      ascending: true,
    });
  },

  async create(payload) {
    return dbAdapter.insert('cancel_requests', {
      id: createId(),
      ...payload,
      status: 'pending_approval',
      requested_at: new Date().toISOString(),
    });
  },

  async updateStatus(id, status, reviewerId = null) {
    return dbAdapter.update(
      'cancel_requests',
      {
        status,
        reviewed_by_user_id: reviewerId,
        reviewed_at: new Date().toISOString(),
      },
      [{ column: 'id', value: id }]
    );
  },
};
