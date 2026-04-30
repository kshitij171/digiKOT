import { dbAdapter } from '../lib/db/dbAdapter';
import { createId } from '../lib/utils/id';

const RESOLVED = ['done', 'removed', 'out_of_stock', 'cancelled'];

export const kotRepository = {
  async getById(kotId) {
    return dbAdapter.select('kots', {
      filters: [{ column: 'id', value: kotId }],
      single: true,
    });
  },

  async listByTable(tableNumber) {
    const kots = await dbAdapter.select('kots', {
      filters: [{ column: 'table_number', value: tableNumber }],
      orderBy: 'created_at',
      ascending: true,
    });
    if (!kots.length) return [];
    const ids = kots.map((k) => k.id);
    const items = await dbAdapter.select('kot_items', {
      filters: [{ column: 'kot_id', operator: 'in', value: ids }],
    });
    const byKot = items.reduce((acc, item) => {
      acc[item.kot_id] = acc[item.kot_id] || [];
      acc[item.kot_id].push(item);
      return acc;
    }, {});
    return kots.map((k) => ({ ...k, items: byKot[k.id] || [] }));
  },

  async listOpen() {
    const kots = await dbAdapter.select('kots', {
      filters: [{ column: 'status', value: 'open' }],
      orderBy: 'created_at',
      ascending: true,
    });
    if (!kots.length) return [];
    const ids = kots.map((k) => k.id);
    const items = await dbAdapter.select('kot_items', {
      filters: [{ column: 'kot_id', operator: 'in', value: ids }],
    });
    const byKot = items.reduce((acc, item) => {
      acc[item.kot_id] = acc[item.kot_id] || [];
      acc[item.kot_id].push(item);
      return acc;
    }, {});
    return kots.map((k) => ({ ...k, items: byKot[k.id] || [] }));
  },

  async createKot({ sessionId, tableNumber, waiterUserId, specialInstructions, items }) {
    const kotId = createId();
    const now = new Date().toISOString();
    await dbAdapter.insert('kots', {
      id: kotId,
      session_id: sessionId,
      table_number: tableNumber,
      waiter_user_id: waiterUserId,
      special_instructions: specialInstructions || null,
      status: 'open',
      created_at: now,
      updated_at: now,
    });
    await dbAdapter.insert(
      'kot_items',
      items.map((item) => ({
        id: createId(),
        kot_id: kotId,
        menu_item_id: item.itemId,
        item_name_snapshot: item.name,
        qty: item.qty,
        price_snapshot: item.price,
        image_url: item.imageUrl,
        status: item.status || 'pending',
        updated_at: now,
      }))
    );
    return kotId;
  },

  async updateItemStatus(kotId, menuItemId, status) {
    await dbAdapter.update(
      'kot_items',
      { status, updated_at: new Date().toISOString() },
      [
        { column: 'kot_id', value: kotId },
        { column: 'menu_item_id', value: menuItemId },
      ]
    );
    const items = await dbAdapter.select('kot_items', { filters: [{ column: 'kot_id', value: kotId }] });
    if (items.length > 0 && items.every((i) => RESOLVED.includes(i.status))) {
      await dbAdapter.update(
        'kots',
        { status: 'cleared', updated_at: new Date().toISOString(), cleared_at: new Date().toISOString() },
        [{ column: 'id', value: kotId }]
      );
    }
  },

  async deleteClearedByTable(tableNumber) {
    const rows = await dbAdapter.select('kots', {
      filters: [
        { column: 'table_number', value: tableNumber },
        { column: 'status', value: 'cleared' },
      ],
    });
    if (rows.length === 0) return;
    for (const row of rows) {
      await dbAdapter.delete('kot_items', [{ column: 'kot_id', value: row.id }]);
      await dbAdapter.delete('kots', [{ column: 'id', value: row.id }]);
    }
  },
};
