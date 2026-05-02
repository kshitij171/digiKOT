import { dbAdapter } from '../lib/db/dbAdapter';
import { supabase } from '../lib/db/supabaseClient';
import { createId } from '../lib/utils/id';

const RESOLVED = ['done', 'removed', 'out_of_stock', 'cancelled'];

async function attachItems(kots) {
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
}

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
    return attachItems(kots);
  },

  async listOpen() {
    const kots = await dbAdapter.select('kots', {
      filters: [{ column: 'status', value: 'open' }],
      orderBy: 'created_at',
      ascending: true,
    });
    return attachItems(kots);
  },

  async listRecent(limit = 30) {
    const kots = await dbAdapter.select('kots', {
      orderBy: 'created_at',
      ascending: false,
      limit,
    });
    return attachItems(kots);
  },

  // ── Audit queries ─────────────────────────────────────────
  async listIndentReceived({ fromDate, toDate } = {}) {
    let q = supabase.from('kots').select('*').not('indent_received_at', 'is', null);
    if (fromDate) q = q.gte('indent_received_at', fromDate);
    if (toDate) q = q.lte('indent_received_at', toDate);
    const { data, error } = await q.order('indent_received_at', { ascending: false }).limit(200);
    if (error) throw error;
    return attachItems(data || []);
  },

  async listCancelled({ fromDate, toDate } = {}) {
    let q = supabase.from('kots').select('*').eq('status', 'cancelled');
    if (fromDate) q = q.gte('cancelled_at', fromDate);
    if (toDate) q = q.lte('cancelled_at', toDate);
    const { data, error } = await q.order('cancelled_at', { ascending: false }).limit(200);
    if (error) throw error;
    return attachItems(data || []);
  },

  // ── Mutations ─────────────────────────────────────────────
  async createKot({ sessionId, tableNumber, waiterUserId, waiterUsername, specialInstructions, items }) {
    const kotId = createId();
    const now = new Date().toISOString();
    await dbAdapter.insert('kots', {
      id: kotId,
      session_id: sessionId,
      table_number: tableNumber,
      waiter_user_id: waiterUserId,
      waiter_username: waiterUsername || null,
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

  async markIndentReceived(kotId, receivedBy) {
    return dbAdapter.update(
      'kots',
      {
        indent_received_at: new Date().toISOString(),
        indent_received_by: receivedBy || null,
        updated_at: new Date().toISOString(),
      },
      [{ column: 'id', value: kotId }]
    );
  },

  async cancelKot(kotId, { cancelledBy, cancelReason }) {
    return dbAdapter.update(
      'kots',
      {
        status: 'cancelled',
        cancelled_by: cancelledBy || null,
        cancelled_at: new Date().toISOString(),
        cancel_reason: cancelReason || null,
        updated_at: new Date().toISOString(),
      },
      [{ column: 'id', value: kotId }]
    );
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
