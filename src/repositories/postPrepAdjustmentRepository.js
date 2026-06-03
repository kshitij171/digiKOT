import { dbAdapter } from '../lib/db/dbAdapter';
import { createId } from '../lib/utils/id';

export const postPrepAdjustmentRepository = {
  /**
   * Inserts a post-prep adjustment row.
   * @param {object} payload
   * @returns {Promise<any>}
   */
  async create(payload) {
    try {
      return dbAdapter.insert('postprep_adjustments', {
        id: createId(),
        ...payload,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      throw err;
    }
  },
};
