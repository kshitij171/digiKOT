import { dbAdapter } from '../lib/db/dbAdapter';
import { createId } from '../lib/utils/id';

export const tableSessionRepository = {
  /**
   * Returns the active table session for a table, if any.
   * @param {number} tableNumber
   * @returns {Promise<object|null>}
   */
  async getActiveByTable(tableNumber) {
    try {
      return dbAdapter.select('table_sessions', {
        filters: [
          { column: 'table_number', value: tableNumber },
          { column: 'status', value: 'active' },
        ],
        orderBy: 'opened_at',
        ascending: false,
        limit: 1,
      }).then((rows) => rows?.[0] || null);
    } catch (err) {
      throw err;
    }
  },

  /**
   * Ensures an active table session exists (creates one if missing).
   * @param {number} tableNumber
   * @param {string} openedByUserId
   * @returns {Promise<object>} Active session.
   */
  async ensureActive(tableNumber, openedByUserId) {
    try {
      const existing = await this.getActiveByTable(tableNumber);
      if (existing) return existing;
      const id = createId();
      await dbAdapter.insert('table_sessions', {
        id,
        table_number: tableNumber,
        opened_by_user_id: openedByUserId,
        status: 'active',
        opened_at: new Date().toISOString(),
      });
      return { id, table_number: tableNumber, opened_by_user_id: openedByUserId, status: 'active' };
    } catch (err) {
      throw err;
    }
  },

  /**
   * Closes a table session by id.
   * @param {string} sessionId
   * @returns {Promise<any>}
   */
  async close(sessionId) {
    try {
      return dbAdapter.update(
        'table_sessions',
        { status: 'closed', closed_at: new Date().toISOString() },
        [{ column: 'id', value: sessionId }]
      );
    } catch (err) {
      throw err;
    }
  },
};
