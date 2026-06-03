import { dbAdapter } from '../lib/db/dbAdapter';
import { createId } from '../lib/utils/id';

export const cancelRepository = {
  /**
   * Finds a cancel request by id.
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async findById(id) {
    try {
      return dbAdapter.select('cancel_requests', {
        filters: [{ column: 'id', value: id }],
        single: true,
      });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Lists cancel requests for a table.
   * @param {number} tableNumber
   * @returns {Promise<Array<object>>}
   */
  async listByTable(tableNumber) {
    try {
      return dbAdapter.select('cancel_requests', {
        filters: [{ column: 'table_number', value: tableNumber }],
        orderBy: 'requested_at',
        ascending: false,
      });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Lists pending approval cancel requests.
   * @returns {Promise<Array<object>>}
   */
  async listPending() {
    try {
      return dbAdapter.select('cancel_requests', {
        filters: [{ column: 'status', value: 'pending_approval' }],
        orderBy: 'requested_at',
        ascending: true,
      });
    } catch (err) {
      throw err;
    }
  },

  /** All cancellation requests, newest first (manager Cancelled KOTs tab). */
  async listAll(limit = 500) {
    try {
      return dbAdapter.select('cancel_requests', {
        orderBy: 'requested_at',
        ascending: false,
        limit,
      });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Creates a new cancel request (pending approval).
   * @param {object} payload
   * @returns {Promise<any>}
   */
  async create(payload) {
    try {
      return dbAdapter.insert('cancel_requests', {
        id: createId(),
        ...payload,
        status: 'pending_approval',
        requested_at: new Date().toISOString(),
      });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Updates status and review metadata for a cancel request.
   * @param {string} id
   * @param {string} status
   * @param {string|null} [reviewerId]
   * @returns {Promise<any>}
   */
  async updateStatus(id, status, reviewerId = null) {
    try {
      return dbAdapter.update(
        'cancel_requests',
        {
          status,
          reviewed_by_user_id: reviewerId,
          reviewed_at: new Date().toISOString(),
        },
        [{ column: 'id', value: id }]
      );
    } catch (err) {
      throw err;
    }
  },
};
