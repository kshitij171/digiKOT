import { dbAdapter } from '../lib/db/dbAdapter';

export const waiterSessionRepository = {
  /**
   * Inserts a waiter session row.
   * @param {object} args
   * @param {string} args.id
   * @param {string} args.waiterId
   * @param {string} args.loggedInAt
   * @param {string|null} [args.deviceIdentifier]
   * @returns {Promise<any>}
   */
  async create({ id, waiterId, loggedInAt, deviceIdentifier }) {
    try {
      return dbAdapter.insert('waiter_sessions', {
        id,
        waiter_id: waiterId,
        logged_in_at: loggedInAt,
        device_identifier: deviceIdentifier || null,
      });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Closes a waiter session by setting logged_out_at.
   * @param {string} sessionId
   * @param {string} loggedOutAt
   * @returns {Promise<any>}
   */
  async closeSession(sessionId, loggedOutAt) {
    try {
      return dbAdapter.update(
        'waiter_sessions',
        { logged_out_at: loggedOutAt },
        [{ column: 'id', value: sessionId }]
      );
    } catch (err) {
      throw err;
    }
  },
};
