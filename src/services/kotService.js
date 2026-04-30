import { kotRepository } from '../repositories/kotRepository';
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
    specialInstructions: row.special_instructions || '',
    kotStatus: row.status,
    createdAt: row.created_at ? new Date(row.created_at) : null,
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

  async createKotFromCart({ tableNumber, waiterUserId, items, specialInstructions }) {
    const session = await tableService.ensureActiveSession(tableNumber, waiterUserId);
    const kotId = await kotRepository.createKot({
      sessionId: session.id,
      tableNumber,
      waiterUserId,
      specialInstructions,
      items,
    });
    await auditService.log({
      actor_user_id: waiterUserId,
      action: 'create_kot',
      entity_type: 'kot',
      entity_id: kotId,
      after_json: { tableNumber, itemCount: items.length },
    });
    return kotId;
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
