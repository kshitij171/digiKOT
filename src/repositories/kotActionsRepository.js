import { dbAdapter } from '../lib/db/dbAdapter';
import { createId } from '../lib/utils/id';

export const kotActionsRepository = {
  /**
   * Inserts a kot_actions row.
   * @param {object} args
   * @param {string} args.kotId
   * @param {string} args.action
   * @param {string|null} [args.performedByWaiterId]
   * @returns {Promise<any>}
   */
  async logAction({ kotId, action, performedByWaiterId }) {
    try {
      return dbAdapter.insert('kot_actions', {
        id: createId(),
        kot_id: kotId,
        action,
        performed_by_waiter_id: performedByWaiterId || null,
        performed_at: new Date().toISOString(),
      });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Lists actions for a KOT (most recent first).
   * @param {string} kotId
   * @returns {Promise<Array<object>>}
   */
  async listByKot(kotId) {
    try {
      return dbAdapter.select('kot_actions', {
        filters: [{ column: 'kot_id', value: kotId }],
        orderBy: 'performed_at',
        ascending: false,
      });
    } catch (err) {
      throw err;
    }
  },
};
