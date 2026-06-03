import { dbAdapter } from '../lib/db/dbAdapter';
import { createId } from '../lib/utils/id';

export const auditRepository = {
  /**
   * Inserts an audit log row.
   * @param {object} payload
   * @returns {Promise<any>}
   */
  async create(payload) {
    try {
      return dbAdapter.insert('audit_logs', {
        id: createId(),
        ...payload,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Lists recent audit logs (most recent first).
   * @param {number} [limit=200]
   * @returns {Promise<Array<object>>}
   */
  async listRecent(limit = 200) {
    try {
      return dbAdapter.select('audit_logs', {
        orderBy: 'created_at',
        ascending: false,
        limit,
      });
    } catch (err) {
      throw err;
    }
  },
};
