import { dbAdapter } from '../lib/db/dbAdapter';
import { supabase } from '../lib/db/supabaseClient';
import { createId } from '../lib/utils/id';

async function runQuery(query) {
  try {
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (err) {
    throw err;
  }
}

export const billingRepository = {
  /**
   * Creates a new bill record and returns its id.
   * @param {object} payload - Insert payload for bills table (excluding id/created_at).
   * @returns {Promise<string>} bill id.
   */
  async createBill(payload) {
    try {
      const billId = createId();
      await dbAdapter.insert('bills', {
        id: billId,
        ...payload,
        created_at: new Date().toISOString(),
      });
      return billId;
    } catch (err) {
      throw err;
    }
  },

  /**
   * Bulk inserts bill_items rows for a bill.
   * @param {Array<object>} items
   * @returns {Promise<void>}
   */
  async createBillItems(items) {
    try {
      if (!items.length) return;
      await dbAdapter.insert('bill_items', items.map((item) => ({ id: createId(), ...item })));
    } catch (err) {
      throw err;
    }
  },

  /** Manager Bills tab: one row per Clear Table (cleared_at set). */
  async listClearedBills({ fromDate, toDate, search } = {}) {
    try {
      let q = supabase.from('bills').select('*, bill_items(*)').not('cleared_at', 'is', null);
      if (fromDate) q = q.gte('cleared_at', fromDate);
      if (toDate) q = q.lte('cleared_at', toDate);
      if (search) {
        const s = search.trim();
        if (s) q = q.or(`waiter_username.ilike.%${s}%,id.ilike.%${s}%`);
      }
      const { data, error } = await q.order('cleared_at', { ascending: false }).limit(500);
      if (error) throw error;
      return data || [];
    } catch (err) {
      throw err;
    }
  },

  /**
   * Alias for listClearedBills used by services.
   * @param {object} [args]
   * @returns {Promise<Array<object>>}
   */
  async listBills({ fromDate, toDate, search } = {}) {
    try {
      return this.listClearedBills({ fromDate, toDate, search });
    } catch (err) {
      throw err;
    }
  },

  /** Latest draft bill for table (print / removal — not yet cleared). */
  async getLatestDraftBillForTable(tableNumber) {
    try {
      const { data, error } = await supabase
        .from('bills')
        .select('*')
        .eq('table_number', tableNumber)
        .is('cleared_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    } catch (err) {
      throw err;
    }
  },

  /**
   * Latest cleared bill for a table.
   * @param {number} tableNumber
   * @returns {Promise<object|null>}
   */
  async getLatestClearedBillForTable(tableNumber) {
    try {
      const { data, error } = await supabase
        .from('bills')
        .select('*')
        .eq('table_number', tableNumber)
        .not('cleared_at', 'is', null)
        .order('cleared_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    } catch (err) {
      throw err;
    }
  },

  /**
   * Updates a bill by id.
   * @param {string} billId
   * @param {object} payload
   * @returns {Promise<any>}
   */
  async updateBill(billId, payload) {
    try {
      return dbAdapter.update('bills', payload, [{ column: 'id', value: billId }]);
    } catch (err) {
      throw err;
    }
  },

  /**
   * Deletes bill_items for a bill.
   * @param {string} billId
   * @returns {Promise<any>}
   */
  async deleteBillItemsForBill(billId) {
    try {
      return dbAdapter.delete('bill_items', [{ column: 'bill_id', value: billId }]);
    } catch (err) {
      throw err;
    }
  },

  /**
   * Replaces bill items for a bill.
   * @param {string} billId
   * @param {Array<object>} items
   * @returns {Promise<void>}
   */
  async replaceBillItems(billId, items) {
    try {
      await this.deleteBillItemsForBill(billId);
      if (items.length) await this.createBillItems(items);
    } catch (err) {
      throw err;
    }
  },

  /**
   * Lists recent bills.
   * @param {number} [limit=30]
   * @returns {Promise<Array<object>>}
   */
  async listRecent(limit = 30) {
    try {
      return dbAdapter.select('bills', {
        orderBy: 'created_at',
        ascending: false,
        limit,
      });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Gets a bill by id.
   * @param {string} billId
   * @returns {Promise<object|null>}
   */
  async getBillById(billId) {
    try {
      return dbAdapter.select('bills', {
        filters: [{ column: 'id', value: billId }],
        single: true,
      });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Lists bill_items for a bill.
   * @param {string} billId
   * @returns {Promise<Array<object>>}
   */
  async getBillItems(billId) {
    try {
      return dbAdapter.select('bill_items', {
        filters: [{ column: 'bill_id', value: billId }],
      });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Excludes a bill_item from bill (manager-approved removal).
   * @param {string} billItemId
   * @returns {Promise<any>}
   */
  async excludeBillItem(billItemId) {
    try {
      return dbAdapter.update(
        'bill_items',
        { include_in_bill: false, exclusion_reason: 'manager_approved_removal' },
        [{ column: 'id', value: billItemId }]
      );
    } catch (err) {
      throw err;
    }
  },

  /**
   * Updates bill monetary totals.
   * @param {string} billId
   * @param {object} totals
   * @returns {Promise<any>}
   */
  async updateBillTotals(billId, { subtotal, service_charge, tax, total }) {
    try {
      return dbAdapter.update(
        'bills',
        { subtotal, service_charge, tax, total },
        [{ column: 'id', value: billId }]
      );
    } catch (err) {
      throw err;
    }
  },

  // ── Void ──────────────────────────────────────────────────
  /**
   * Voids a bill (sets void fields).
   * @param {string} billId
   * @param {object} args
   * @returns {Promise<any>}
   */
  async voidBill(billId, { voidedBy, voidReason }) {
    try {
      return dbAdapter.update(
        'bills',
        {
          voided_by: voidedBy || null,
          voided_at: new Date().toISOString(),
          void_reason: voidReason || null,
        },
        [{ column: 'id', value: billId }]
      );
    } catch (err) {
      throw err;
    }
  },

  // ── Resettle ──────────────────────────────────────────────
  /**
   * Marks a bill as resettled and stores payment method metadata.
   * @param {string} billId
   * @param {object} args
   * @returns {Promise<any>}
   */
  async resettleBill(billId, { resettledBy, originalPayment, newPayment }) {
    try {
      return dbAdapter.update(
        'bills',
        {
          bill_status: 'resettled',
          resettled_by: resettledBy || null,
          resettled_at: new Date().toISOString(),
          original_payment_method: originalPayment || null,
          new_payment_method: newPayment || null,
        },
        [{ column: 'id', value: billId }]
      );
    } catch (err) {
      throw err;
    }
  },

  // ── Discount ──────────────────────────────────────────────
  /**
   * Applies a discount to a bill and updates totals.
   * @param {string} billId
   * @param {object} args
   * @returns {Promise<any>}
   */
  async applyDiscount(billId, { discountPercent, appliedBy, newTotal }) {
    try {
      return dbAdapter.update(
        'bills',
        {
          discount_percent: discountPercent,
          discount_applied_by: appliedBy || null,
          discount_applied_at: new Date().toISOString(),
          total: newTotal,
        },
        [{ column: 'id', value: billId }]
      );
    } catch (err) {
      throw err;
    }
  },

  // ── Audit queries ─────────────────────────────────────────
  /**
   * Lists void bills within a date range.
   * @param {object} [args]
   * @returns {Promise<Array<object>>}
   */
  async listVoidBills({ fromDate, toDate } = {}) {
    try {
      let q = supabase.from('bills').select('*').eq('bill_status', 'void');
      if (fromDate) q = q.gte('voided_at', fromDate);
      if (toDate) q = q.lte('voided_at', toDate);
      return runQuery(q.order('voided_at', { ascending: false }).limit(200));
    } catch (err) {
      throw err;
    }
  },

  /**
   * Lists resettled bills within a date range.
   * @param {object} [args]
   * @returns {Promise<Array<object>>}
   */
  async listResettledBills({ fromDate, toDate } = {}) {
    try {
      let q = supabase.from('bills').select('*').eq('bill_status', 'resettled');
      if (fromDate) q = q.gte('resettled_at', fromDate);
      if (toDate) q = q.lte('resettled_at', toDate);
      return runQuery(q.order('resettled_at', { ascending: false }).limit(200));
    } catch (err) {
      throw err;
    }
  },

  /**
   * Lists bills above a discount threshold.
   * @param {object} [args]
   * @returns {Promise<Array<object>>}
   */
  async listHighDiscountBills({ fromDate, toDate, threshold = 50 } = {}) {
    try {
      let q = supabase.from('bills').select('*').gt('discount_percent', threshold);
      if (fromDate) q = q.gte('discount_applied_at', fromDate);
      if (toDate) q = q.lte('discount_applied_at', toDate);
      return runQuery(q.order('discount_applied_at', { ascending: false }).limit(200));
    } catch (err) {
      throw err;
    }
  },
};
