import { dbAdapter } from '../lib/db/dbAdapter';

export const waiterSessionRepository = {
  async create({ id, waiterId, loggedInAt, deviceIdentifier }) {
    return dbAdapter.insert('waiter_sessions', {
      id,
      waiter_id: waiterId,
      logged_in_at: loggedInAt,
      device_identifier: deviceIdentifier || null,
    });
  },

  async closeSession(sessionId, loggedOutAt) {
    return dbAdapter.update(
      'waiter_sessions',
      { logged_out_at: loggedOutAt },
      [{ column: 'id', value: sessionId }]
    );
  },
};
