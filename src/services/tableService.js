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
  /**
   * Lists all restaurant tables.
   * @returns {Promise<Array<{tableId: string, tableNumber: number, status: string, currentSessionId: string|null}>>}
   */
  async listTables() {
    try {
      const rows = await tableRepository.listTables();
      return rows.map(mapTable);
    } catch (err) {
      throw err;
    }
  },

  /**
   * Subscribes to table changes and provides latest table list to callback.
   * @param {(rows: Array<{tableId: string, tableNumber: number, status: string, currentSessionId: string|null}>) => void} onData
   * @returns {() => void} Cleanup function.
   */
  subscribeTables(onData) {
    const load = async () => {
      try {
        const rows = await this.listTables();
        onData(rows);
      } catch (err) {
        throw err;
      }
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

  /**
   * Marks a table as occupied.
   * @param {number} tableNumber
   * @returns {Promise<void>}
   */
  async setOccupied(tableNumber) {
    try {
      await tableRepository.updateByTableNumber(tableNumber, { status: 'occupied' });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Clears a table: marks available and closes active session if present.
   * @param {number} tableNumber
   * @returns {Promise<void>}
   */
  async clearTable(tableNumber) {
    try {
      const activeSession = await tableSessionRepository.getActiveByTable(tableNumber);
      await tableRepository.updateByTableNumber(tableNumber, { status: 'available', current_session_id: null });
      if (activeSession) {
        await tableSessionRepository.close(activeSession.id);
      }
    } catch (err) {
      throw err;
    }
  },

  /**
   * Ensures an active table session exists and marks the table occupied.
   * @param {number} tableNumber
   * @param {string} openedByUserId
   * @returns {Promise<object>} Session row/object.
   */
  async ensureActiveSession(tableNumber, openedByUserId) {
    try {
      const session = await tableSessionRepository.ensureActive(tableNumber, openedByUserId);
      await tableRepository.updateByTableNumber(tableNumber, {
        status: 'occupied',
        current_session_id: session.id,
      });
      return session;
    } catch (err) {
      throw err;
    }
  },
};
