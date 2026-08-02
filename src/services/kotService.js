import { kotRepository } from '../repositories/kotRepository';
import { billingService } from './billingService';
import { kotActionsRepository } from '../repositories/kotActionsRepository';
import { tableService } from './tableService';
import { menuService } from './menuService';
import { auditService } from './auditService';
import { notificationService } from './notificationService';
import { realtimeAdapter } from '../realtime/realtimeAdapter';
import { createSubscriptionController } from './subscriptionController';

const RESOLVED = ['done', 'removed', 'out_of_stock', 'cancelled'];

function mapKot(row) {
  return {
    _docId: row.id,
    id: row.id,
    tableNumber: row.table_number,
    waiterUserId: row.waiter_user_id || null,
    waiterUsername: row.waiter_username || null,
    specialInstructions: row.special_instructions || '',
    kotStatus: row.status,
    createdAt: row.created_at ? new Date(row.created_at) : null,
    clearedAt: row.cleared_at ? new Date(row.cleared_at) : null,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : null,
    cancelledBy: row.cancelled_by || null,
    cancelReason: row.cancel_reason || null,
    supervisorId: row.supervisor_id || null,
    supervisorName: row.supervisor_name || null,
    assignedAt: row.assigned_at ? new Date(row.assigned_at) : null,
    items: (row.items || []).map((item) => ({
      itemId: item.menu_item_id,
      itemName: item.item_name_snapshot,
      name: item.item_name_snapshot,
      price: item.price_snapshot,
      qty: item.qty,
      imageUrl: item.image_url,
      status: item.status,
      removedQty: item.removed_qty ?? 0,
      finalQty: item.final_qty ?? null,
    })),
  };
}

export const kotService = {
  /**
   * Lists KOTs for a table with items attached and mapped for UI use.
   * @param {number} tableNumber
   * @returns {Promise<Array<object>>}
   */
  async listByTable(tableNumber) {
    try {
      const rows = await kotRepository.listByTable(tableNumber);
      return rows.map(mapKot);
    } catch (err) {
      throw err;
    }
  },

  /**
   * Subscribes to KOT and KOT item updates for a table and emits grouped rows.
   * @param {number} tableNumber
   * @param {(data: {openKots: Array<object>, clearedKots: Array<object>}) => void} onData
   * @returns {() => void} Cleanup function.
   */
  subscribeByTable(tableNumber, onData) {
    const load = async () => {
      try {
        const all = await this.listByTable(tableNumber);
        onData({
          openKots: all.filter((k) => k.kotStatus === 'open'),
          clearedKots: all.filter((k) => k.kotStatus === 'cleared'),
        });
      } catch (err) {
        throw err;
      }
    };
    return createSubscriptionController({
      load,
      subscribeFns: [
        (onEvent, onStatus) =>
          realtimeAdapter.subscribe({
            channelName: `table-kots-${tableNumber}`,
            table: 'kots',
            filter: `table_number=eq.${tableNumber}`,
            onEvent,
            onStatus,
          }),
        (onEvent, onStatus) =>
          realtimeAdapter.subscribe({
            channelName: `table-kot-items-${tableNumber}`,
            table: 'kot_items',
            onEvent,
            onStatus,
          }),
      ],
    });
  },

  /**
   * Lists all open KOTs (kitchen view).
   * @returns {Promise<Array<object>>}
   */
  async listOpen() {
    try {
      const rows = await kotRepository.listOpen();
      return rows.map(mapKot);
    } catch (err) {
      throw err;
    }
  },

  /**
   * Subscribes to open KOT updates for kitchen view.
   * @param {(rows: Array<object>) => void} onData
   * @returns {() => void} Cleanup function.
   */
  subscribeOpen(onData) {
    const load = async () => {
      try {
        const rows = await this.listOpen();
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
            channelName: 'open-kots',
            table: 'kots',
            filter: 'status=eq.open',
            onEvent,
            onStatus,
          }),
        (onEvent, onStatus) =>
          realtimeAdapter.subscribe({
            channelName: 'open-kot-items',
            table: 'kot_items',
            onEvent,
            onStatus,
          }),
      ],
    });
  },

  /**
   * Lists recent KOTs.
   * @param {number} [limit=30]
   * @returns {Promise<Array<object>>}
   */
  async listRecent(limit = 30) {
    try {
      const rows = await kotRepository.listRecent(limit);
      return rows.map(mapKot);
    } catch (err) {
      throw err;
    }
  },

  // ── Audit list queries ────────────────────────────────────

  /**
   * Paginated past KOTs cleared by this supervisor.
   * Returns { kots, total, page, pageSize }.
   */
  async listPastKots(supervisorId, page = 1, pageSize = 20) {
    try {
      const offset = (page - 1) * pageSize;
      const { rows, total } = await kotRepository.listClearedBySupervisor(supervisorId, {
        offset,
        limit: pageSize,
      });
      const result = { kots: rows.map(mapKot), total, page, pageSize };
      return result;
    } catch (err) {
      throw err;
    }
  },

  /**
   * Lists cancelled KOTs within an optional date range.
   * @param {object} [args]
   * @param {string|null} [args.fromDate]
   * @param {string|null} [args.toDate]
   * @returns {Promise<Array<object>>}
   */
  async listCancelledKots({ fromDate, toDate } = {}) {
    try {
      const rows = await kotRepository.listCancelled({ fromDate, toDate });
      return rows.map(mapKot);
    } catch (err) {
      throw err;
    }
  },

  // ── Mutations ─────────────────────────────────────────────
  /**
   * Creates a new KOT and associated kot_items from a cart snapshot.
   * @param {object} args
   * @param {number} args.tableNumber
   * @param {string} args.waiterUserId
   * @param {string|null} [args.waiterUsername]
   * @param {Array<object>} args.items
   * @param {string} [args.specialInstructions]
   * @returns {Promise<string>} Created KOT id.
   */
  async createKotFromCart({ tableNumber, waiterUserId, waiterUsername, items, specialInstructions }) {
    try {
      const session = await tableService.ensureActiveSession(tableNumber, waiterUserId);
      const kotId = await kotRepository.createKot({
        sessionId: session.id,
        tableNumber,
        waiterUserId,
        waiterUsername: waiterUsername || null,
        specialInstructions,
        items,
      });

      await kotActionsRepository.logAction({
        kotId,
        action: 'created',
        performedByWaiterId: waiterUserId,
      }).catch((e) => console.warn('kot_actions log failed:', e));

      await auditService.log({
        actor_user_id: waiterUserId,
        action: 'create_kot',
        entity_type: 'kot',
        entity_id: kotId,
        after_json: { tableNumber, itemCount: items.length, waiterUsername: waiterUsername || null },
      });
      return kotId;
    } catch (err) {
      throw err;
    }
  },

  /**
   * Cancels a KOT and writes audit / action logs.
   * @param {object} args
   * @param {string} args.kotId
   * @param {string} args.cancelledBy
   * @param {string|null} [args.cancelReason]
   * @returns {Promise<void>}
   */
  async cancelKot({ kotId, cancelledBy, cancelReason }) {
    try {
      await kotRepository.cancelKot(kotId, { cancelledBy, cancelReason });
      await kotActionsRepository.logAction({
        kotId,
        action: 'cancelled',
        performedByWaiterId: cancelledBy,
      }).catch(() => {});
      await auditService.log({
        actor_user_id: cancelledBy,
        action: 'CANCEL_KOT',
        entity_type: 'kot',
        entity_id: kotId,
        remarks: cancelReason || null,
      });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Updates a KOT item status and applies related side-effects (notifications, OOS, audit).
   * @param {object} args
   * @param {string} args.kotId
   * @param {string} args.itemId
   * @param {string} args.status
   * @param {string} args.kitchenUserId
   * @param {string|null} [args.supervisorId]
   * @param {string|null} [args.supervisorName]
   * @returns {Promise<void>}
   */
  async markItemStatus({ kotId, itemId, status, kitchenUserId, supervisorId, supervisorName }) {
    try {
      const kot = await kotRepository.getById(kotId);

      // First-touch ownership: tag this KOT with the supervisor who acted first
      if (supervisorId) {
        await kotRepository.assignSupervisor(kotId, supervisorId, supervisorName || null).catch((e) =>
          console.warn('assignSupervisor failed:', e)
        );
      }

      await kotRepository.updateItemStatus(kotId, itemId, status);
      if (status === 'out_of_stock') {
        await menuService.setOutOfStock(itemId, true);
      }
      if (kot?.waiter_user_id) {
        await notificationService.createNotification({
          target_user_id: kot.waiter_user_id,
          table_number: kot.table_number,
          session_id: kot.session_id,
          event_type: status === 'done' ? 'item_ready' : 'item_out_of_stock',
          payload_json: { kotId, itemId, status },
        });
      }
      await auditService.log({
        actor_user_id: kitchenUserId,
        action: 'update_kot_item_status',
        entity_type: 'kot_item',
        entity_id: `${kotId}:${itemId}`,
        after_json: { status },
      });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Clears a table: finalizes bill if needed and closes the table session.
   * Cleared KOT rows are intentionally preserved for analytics/audit history.
   * @param {number} tableNumber
   * @param {string} actorUserId
   * @param {object} [options]
   * @returns {Promise<void>}
   */
  async clearTable(tableNumber, actorUserId, options = {}) {
    try {
      const rows = await kotRepository.listByTable(tableNumber);
      const clearedKots = rows.filter((r) => r.status === 'cleared').map(mapKot);

      if (clearedKots.length > 0) {
        await billingService.finalizeBillOnClearTable({
          tableNumber,
          waiterUserId: options.waiterUserId ?? actorUserId ?? null,
          waiterUsername: options.waiterUsername ?? null,
          clearedKots,
          serviceChargePct: options.serviceChargePct ?? 5,
          taxPct: options.taxPct ?? 18,
          discountPercent: options.discountPercent ?? 0,
        });
      }

      await tableService.clearTable(tableNumber);
      await auditService.log({
        actor_user_id: actorUserId,
        action: 'clear_table',
        entity_type: 'table',
        entity_id: String(tableNumber),
      });
    } catch (err) {
      throw err;
    }
  },
};

/**
 * Returns true if all items are in a terminal/resolved status.
 * @param {Array<{status: string}>} items
 * @returns {boolean}
 */
export function isKotResolved(items) {
  return items.every((i) => RESOLVED.includes(i.status));
}
