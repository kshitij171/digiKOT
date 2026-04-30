import { dbAdapter } from '../lib/db/dbAdapter';
import { createId } from '../lib/utils/id';

export const tableSessionRepository = {
  async getActiveByTable(tableNumber) {
    return dbAdapter.select('table_sessions', {
      filters: [
        { column: 'table_number', value: tableNumber },
        { column: 'status', value: 'active' },
      ],
      orderBy: 'opened_at',
      ascending: false,
      limit: 1,
    }).then((rows) => rows?.[0] || null);
  },

  async ensureActive(tableNumber, openedByUserId) {
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
  },

  async close(sessionId) {
    return dbAdapter.update(
      'table_sessions',
      { status: 'closed', closed_at: new Date().toISOString() },
      [{ column: 'id', value: sessionId }]
    );
  },
};
