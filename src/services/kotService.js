import { kotRepository } from '../repositories/kotRepository';
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
    indentReceivedAt: row.indent_received_at ? new Date(row.indent_received_at) : null,
    indentReceivedBy: row.indent_received_by || null,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : null,
    cancelledBy: row.cancelled_by || null,
    cancelReason: row.cancel_reason || null,
    items: (row.items || []).map((item) => ({
      itemId: item.menu_item_id,
      name: item.item_name_snapshot,
      price: item.price_snapshot,
      qty: item.qty,
      imageUrl: item.image_url,
      status: item.status,
    })),
  };
}

export const kotService = {
  async listByTable(tableNumber) {
    const rows = await kotRepository.listByTable(tableNumber);
    return rows.map(mapKot);
  },

  subscribeByTable(tableNumber, onData) {
    const load = async () => {
      const all = await this.listByTable(tableNumber);
      onData({
        openKots: all.filter((k) => k.kotStatus === 'open'),
        clearedKots: all.filter((k) => k.kotStatus === 'cleared'),
      });
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

  async listOpen() {
    const rows = await kotRepository.listOpen();
    return rows.map(mapKot);
  },

  subscribeOpen(onData) {
    const load = async () => {
      const rows = await this.listOpen();
      onData(rows);
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

  async listRecent(limit = 30) {
    const rows = await kotRepository.listRecent(limit);
    return rows.map(mapKot);
  },

  // ── Audit list queries ────────────────────────────────────
  async listIndentReceived({ fromDate, toDate } = {}) {
    const rows = await kotRepository.listIndentReceived({ fromDate, toDate });
    return rows.map(mapKot);
  },

  async listCancelledKots({ fromDate, toDate } = {}) {
    const rows = await kotRepository.listCancelled({ fromDate, toDate });
    return rows.map(mapKot);
  },

  // ── Mutations ─────────────────────────────────────────────
  async createKotFromCart({ tableNumber, waiterUserId, waiterUsername, items, specialInstructions }) {
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
  },

  async acknowledgeIndent({ kotId, kitchenUserId }) {
    await kotRepository.markIndentReceived(kotId, kitchenUserId);
    await auditService.log({
      actor_user_id: kitchenUserId,
      action: 'INDENT_RECEIVED',
      entity_type: 'kot',
      entity_id: kotId,
      after_json: { receivedAt: new Date().toISOString() },
    });
  },

  async cancelKot({ kotId, cancelledBy, cancelReason }) {
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
  },

  async markItemStatus({ kotId, itemId, status, kitchenUserId }) {
    const kot = await kotRepository.getById(kotId);
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
  },

  async clearTable(tableNumber, actorUserId) {
    await kotRepository.deleteClearedByTable(tableNumber);
    await tableService.clearTable(tableNumber);
    await auditService.log({
      actor_user_id: actorUserId,
      action: 'clear_table',
      entity_type: 'table',
      entity_id: String(tableNumber),
    });
  },
};

export function isKotResolved(items) {
  return items.every((i) => RESOLVED.includes(i.status));
}
