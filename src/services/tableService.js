import { tableRepository } from '../repositories/tableRepository';
import { tableSessionRepository } from '../repositories/tableSessionRepository';
import { realtimeAdapter } from '../realtime/realtimeAdapter';
import { createSubscriptionController } from './subscriptionController';

function mapTable(row) {
  return {
    tableId: row.id || `T${row.table_number}`,
    tableNumber: row.table_number,
    status: row.status,
    currentSessionId: row.current_session_id || null,
  };
}

export const tableService = {
  async listTables() {
    const rows = await tableRepository.listTables();
    return rows.map(mapTable);
  },

  subscribeTables(onData) {
    const load = async () => {
      const rows = await this.listTables();
      onData(rows);
    };
    return createSubscriptionController({
      load,
      subscribeFns: [
        (onEvent, onStatus) =>
          realtimeAdapter.subscribe({
            channelName: 'tables-watch',
            table: 'restaurant_tables',
            onEvent,
            onStatus,
          }),
      ],
    });
  },

  async setOccupied(tableNumber) {
    await tableRepository.updateByTableNumber(tableNumber, { status: 'occupied' });
  },

  async clearTable(tableNumber) {
    const activeSession = await tableSessionRepository.getActiveByTable(tableNumber);
    await tableRepository.updateByTableNumber(tableNumber, { status: 'available', current_session_id: null });
    if (activeSession) {
      await tableSessionRepository.close(activeSession.id);
    }
  },

  async ensureActiveSession(tableNumber, openedByUserId) {
    const session = await tableSessionRepository.ensureActive(tableNumber, openedByUserId);
    await tableRepository.updateByTableNumber(tableNumber, {
      status: 'occupied',
      current_session_id: session.id,
    });
    return session;
  },
};
