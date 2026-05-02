import { dbAdapter } from '../lib/db/dbAdapter';
import { createId } from '../lib/utils/id';

export const billModificationRepository = {
  async createRequest({ billId, waiterId, waiterUsername, tableNumber, itemsToRemove, reason }) {
    return dbAdapter.insert('bill_modification_requests', {
      id: createId(),
      bill_id: billId,
      waiter_id: waiterId || null,
      waiter_username: waiterUsername || null,
      table_number: tableNumber || null,
      items_to_remove: itemsToRemove,
      reason,
      status: 'pending',
      requested_at: new Date().toISOString(),
    });
  },

  async getById(requestId) {
    return dbAdapter.select('bill_modification_requests', {
      filters: [{ column: 'id', value: requestId }],
      single: true,
    });
  },

  async listPending() {
    return dbAdapter.select('bill_modification_requests', {
      filters: [{ column: 'status', value: 'pending' }],
      orderBy: 'requested_at',
      ascending: false,
    });
  },

  async listAll(limit = 100) {
    return dbAdapter.select('bill_modification_requests', {
      orderBy: 'requested_at',
      ascending: false,
      limit,
    });
  },

  async updateStatus(requestId, status, reviewedByManagerId, rejectionReason) {
    return dbAdapter.update(
      'bill_modification_requests',
      {
        status,
        reviewed_by_manager_id: reviewedByManagerId || null,
        reviewed_at: new Date().toISOString(),
        rejection_reason: rejectionReason || null,
      },
      [{ column: 'id', value: requestId }]
    );
  },
};
