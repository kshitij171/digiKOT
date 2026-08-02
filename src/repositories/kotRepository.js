import { dbAdapter } from '../lib/db/dbAdapter';
import { apiClient } from '../lib/api/apiClient';
import { createId } from '../lib/utils/id';


const RESOLVED = ['done', 'removed', 'out_of_stock', 'cancelled'];

async function attachItems(kots) {
  try {
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
  } catch (err) {
    throw err;
  }
}

export const kotRepository = {
  /**
   * Gets a KOT by id.
   * @param {string} kotId
   * @returns {Promise<object|null>}
   */
  async getById(kotId) {
    try {
      return dbAdapter.select('kots', {
        filters: [{ column: 'id', value: kotId }],
        single: true,
      });
    } catch (err) {
      throw err;
    }
  },

  /** Full KOT row plus kot_items (for audit feed detail). */
  async getByIdWithItems(kotId) {
    try {
      const kot = await this.getById(kotId);
      if (!kot) return null;
      const withItems = await attachItems([kot]);
      return withItems[0] || null;
    } catch (err) {
      throw err;
    }
  },

  /**
   * Lists KOTs for a table with items attached.
   * @param {number} tableNumber
   * @returns {Promise<Array<object>>}
   */
  async listByTable(tableNumber) {
    try {
      const kots = await dbAdapter.select('kots', {
        filters: [{ column: 'table_number', value: tableNumber }],
        orderBy: 'created_at',
        ascending: true,
      });
      return attachItems(kots);
    } catch (err) {
      throw err;
    }
  },

  /** All KOTs for a table session (manager audit bill reconstruction). */
  async listBySession(sessionId) {
    try {
      if (!sessionId) return [];
      const kots = await dbAdapter.select('kots', {
        filters: [{ column: 'session_id', value: sessionId }],
        orderBy: 'created_at',
        ascending: true,
      });
      return attachItems(kots);
    } catch (err) {
      throw err;
    }
  },

  /** Load specific KOT rows with items (when session_id is missing on bill). */
  async listByIds(kotIds) {
    try {
      const ids = [...new Set((kotIds || []).filter(Boolean))];
      if (!ids.length) return [];
      const kots = await dbAdapter.select('kots', {
        filters: [{ column: 'id', operator: 'in', value: ids }],
        orderBy: 'created_at',
        ascending: true,
      });
      return attachItems(kots);
    } catch (err) {
      throw err;
    }
  },

  /**
   * Lists open KOTs with items attached.
   * @returns {Promise<Array<object>>}
   */
  async listOpen() {
    try {
      const kots = await dbAdapter.select('kots', {
        filters: [{ column: 'status', value: 'open' }],
        orderBy: 'created_at',
        ascending: true,
      });
      return attachItems(kots);
    } catch (err) {
      throw err;
    }
  },

  /**
   * Lists recent KOTs with items attached.
   * @param {number} [limit=30]
   * @returns {Promise<Array<object>>}
   */
  async listRecent(limit = 30) {
    try {
      const kots = await dbAdapter.select('kots', {
        orderBy: 'created_at',
        ascending: false,
        limit,
      });
      return attachItems(kots);
    } catch (err) {
      throw err;
    }
  },

  // ── Audit queries ─────────────────────────────────────────

  /**
   * Paginated cleared KOTs owned by a specific supervisor.
   * Returns { rows, total } — rows already have items attached.
   */
  async listClearedBySupervisor(supervisorId, { offset = 0, limit = 20 } = {}) {
    try {
      return apiClient.query('kots.listClearedBySupervisor', { supervisorId, offset, limit });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Lists cancelled KOTs with items attached.
   * @param {object} [args]
   * @param {string|null} [args.fromDate]
   * @param {string|null} [args.toDate]
   * @returns {Promise<Array<object>>}
   */
  async listCancelled({ fromDate, toDate } = {}) {
    try {
      return apiClient.query('kots.listCancelled', { fromDate, toDate });
    } catch (err) {
      throw err;
    }
  },

  // ── Mutations ─────────────────────────────────────────────
  /**
   * Creates a KOT and its kot_items rows.
   * @param {object} args
   * @returns {Promise<string>} kot id.
   */
  async createKot({ sessionId, tableNumber, waiterUserId, waiterUsername, specialInstructions, items }) {
    try {
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
        cleared_at: null,
        supervisor_id: null,
        supervisor_name: null,
        assigned_at: null,
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
          removed_qty: null,
          final_qty: null,
          updated_at: now,
        }))
      );
      return kotId;
    } catch (err) {
      throw err;
    }
  },

  /**
   * Stamp supervisor ownership on the KOT — no-op if already assigned.
   * Uses a conditional update (WHERE supervisor_id IS NULL) so only the
   * first-touch supervisor ever gets written.
   */
  async assignSupervisor(kotId, supervisorId, supervisorName) {
    try {
      await apiClient.query('kots.assignSupervisor', { kotId, supervisorId, supervisorName });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Cancels a KOT.
   * @param {string} kotId
   * @param {object} args
   * @returns {Promise<any>}
   */
  async cancelKot(kotId, { cancelledBy, cancelReason }) {
    try {
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
    } catch (err) {
      throw err;
    }
  },

  /**
   * Reduce a KOT item's quantity by removalQty (manager-approved removal).
   * Sets status to 'removed_entirely' if qty drops to 0, else 'partially_removed'.
   * final_qty holds the effective billed quantity; removed_qty records how much was taken off.
   */
  async applyPartialRemoval(kotId, menuItemId, removalQty) {
    try {
      const current = await dbAdapter.select('kot_items', {
        filters: [
          { column: 'kot_id', value: kotId },
          { column: 'menu_item_id', value: menuItemId },
        ],
        single: true,
      });
      if (!current) throw new Error(`kot_item not found for kot=${kotId} item=${menuItemId}`);

      const originalQty = Number(current.qty) || 0;
      const removal = Number(removalQty) || 0;
      const newQty = Math.max(0, originalQty - removal);
      const fullyRemoved = newQty === 0;
      const removedQtyStored = fullyRemoved ? originalQty : removal;

      await dbAdapter.update(
        'kot_items',
        {
          removed_qty: removedQtyStored,
          final_qty: newQty,
          status: fullyRemoved ? 'removed_entirely' : 'partially_removed',
          updated_at: new Date().toISOString(),
        },
        [
          { column: 'kot_id', value: kotId },
          { column: 'menu_item_id', value: menuItemId },
        ]
      );
    } catch (err) {
      throw err;
    }
  },

  /**
   * Updates a kot_item status and auto-clears KOT when all items resolved.
   * @param {string} kotId
   * @param {string} menuItemId
   * @param {string} status
   * @returns {Promise<void>}
   */
  async updateItemStatus(kotId, menuItemId, status) {
    try {
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
    } catch (err) {
      throw err;
    }
  },

  /**
   * Deletes all cleared KOTs and their items for a table.
   * @param {number} tableNumber
   * @returns {Promise<void>}
   */
  async deleteClearedByTable(tableNumber) {
    try {
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
    } catch (err) {
      throw err;
    }
  },
};
