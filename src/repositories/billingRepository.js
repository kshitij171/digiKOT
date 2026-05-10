import { dbAdapter } from '../lib/db/dbAdapter';
import { supabase } from '../lib/db/supabaseClient';
import { createId } from '../lib/utils/id';

async function runQuery(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export const billingRepository = {
  async createBill(payload) {
    const billId = createId();
    await dbAdapter.insert('bills', {
      id: billId,
      ...payload,
      created_at: new Date().toISOString(),
    });
    return billId;
  },

  async createBillItems(items) {
    if (!items.length) return;
    await dbAdapter.insert('bill_items', items.map((item) => ({ id: createId(), ...item })));
  },

  async listBills({ fromDate, toDate, search } = {}) {
    let q = supabase.from('bills').select('*, bill_items(*)');
    if (fromDate) q = q.gte('created_at', fromDate);
    if (toDate) q = q.lte('created_at', toDate);
    if (search) {
      const s = search.trim();
      if (s) q = q.or(`waiter_username.ilike.%${s}%,id.ilike.%${s}%`);
    }
    const { data, error } = await q.order('created_at', { ascending: false }).limit(500);
    if (error) throw error;
    return data || [];
  },

  async listRecent(limit = 30) {
    return dbAdapter.select('bills', {
      orderBy: 'created_at',
      ascending: false,
      limit,
    });
  },

  async getBillById(billId) {
    return dbAdapter.select('bills', {
      filters: [{ column: 'id', value: billId }],
      single: true,
    });
  },

  async getBillItems(billId) {
    return dbAdapter.select('bill_items', {
      filters: [{ column: 'bill_id', value: billId }],
    });
  },

  async excludeBillItem(billItemId) {
    return dbAdapter.update(
      'bill_items',
      { include_in_bill: false, exclusion_reason: 'manager_approved_removal' },
      [{ column: 'id', value: billItemId }]
    );
  },

  async updateBillTotals(billId, { subtotal, service_charge, tax, total }) {
    return dbAdapter.update(
      'bills',
      { subtotal, service_charge, tax, total },
      [{ column: 'id', value: billId }]
    );
  },

  // ── Void ──────────────────────────────────────────────────
  async voidBill(billId, { voidedBy, voidReason }) {
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
  },

  // ── Resettle ──────────────────────────────────────────────
  async resettleBill(billId, { resettledBy, originalPayment, newPayment }) {
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
  },

  // ── Discount ──────────────────────────────────────────────
  async applyDiscount(billId, { discountPercent, appliedBy, newTotal }) {
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
  },

  // ── Audit queries ─────────────────────────────────────────
  async listVoidBills({ fromDate, toDate } = {}) {
    let q = supabase.from('bills').select('*').eq('bill_status', 'void');
    if (fromDate) q = q.gte('voided_at', fromDate);
    if (toDate) q = q.lte('voided_at', toDate);
    return runQuery(q.order('voided_at', { ascending: false }).limit(200));
  },

  async listResettledBills({ fromDate, toDate } = {}) {
    let q = supabase.from('bills').select('*').eq('bill_status', 'resettled');
    if (fromDate) q = q.gte('resettled_at', fromDate);
    if (toDate) q = q.lte('resettled_at', toDate);
    return runQuery(q.order('resettled_at', { ascending: false }).limit(200));
  },

  async listHighDiscountBills({ fromDate, toDate, threshold = 50 } = {}) {
    let q = supabase.from('bills').select('*').gt('discount_percent', threshold);
    if (fromDate) q = q.gte('discount_applied_at', fromDate);
    if (toDate) q = q.lte('discount_applied_at', toDate);
    return runQuery(q.order('discount_applied_at', { ascending: false }).limit(200));
  },
};
