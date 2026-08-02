import { dbAdapter } from '../lib/db/dbAdapter';
import { apiClient } from '../lib/api/apiClient';
import { createId } from '../lib/utils/id';

async function runQuery(promise) {
  return promise;
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
      return runQuery(apiClient.query('billing.listClearedBills', { fromDate, toDate, search }));
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
      return apiClient.query('billing.getLatestDraftBillForTable', { tableNumber });
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
      return apiClient.query('billing.getLatestClearedBillForTable', { tableNumber });
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
          bill_status: 'void',
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

  /**
   * Marks a bill as printed (physical print / WhatsApp send path).
   * Waiters may set `printed` only — `bill_status` mutations are manager-gated.
   * @param {string} billId
   * @returns {Promise<any>}
   */
  async markPrinted(billId) {
    try {
      return dbAdapter.update(
        'bills',
        { printed: true },
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
      return runQuery(apiClient.query('billing.listVoidBills', { fromDate, toDate }));
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
      return runQuery(apiClient.query('billing.listResettledBills', { fromDate, toDate }));
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
      return runQuery(apiClient.query('billing.listHighDiscountBills', { fromDate, toDate, threshold }));
    } catch (err) {
      throw err;
    }
  },
};
