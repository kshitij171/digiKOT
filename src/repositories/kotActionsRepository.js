import { dbAdapter } from '../lib/db/dbAdapter';
import { createId } from '../lib/utils/id';

export const kotActionsRepository = {
  async logAction({ kotId, action, performedByWaiterId }) {
    return dbAdapter.insert('kot_actions', {
      id: createId(),
      kot_id: kotId,
      action,
      performed_by_waiter_id: performedByWaiterId || null,
      performed_at: new Date().toISOString(),
    });
  },

  async listByKot(kotId) {
    return dbAdapter.select('kot_actions', {
      filters: [{ column: 'kot_id', value: kotId }],
      orderBy: 'performed_at',
      ascending: false,
    });
  },
};
