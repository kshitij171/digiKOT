import { billingRepository } from '../repositories/billingRepository';
import { tableSessionRepository } from '../repositories/tableSessionRepository';
import { auditService } from './auditService';
import {
  computeBillTotalsFromClearedKots,
  applyDiscountPercent,
  billableLinesFromClearedKots,
  ratesFromPercentages,
  ratesImpliedByBill,
} from '../lib/billing/billTotals';

function buildBillItemRows(billId, clearedKots) {
  const rows = [];
  (clearedKots || []).forEach((kot) => {
    const kotKey = kot._docId || kot.id;
    billableLinesFromClearedKots([kot]).forEach(({ item, billQty, unitPrice }) => {
      const lineName =
        item.itemName ?? item.name ?? item.item_name ?? item.itemNameSnapshot ?? 'Unknown item';
      const isPartial = item.status === 'partially_removed';
      rows.push({
        bill_id: billId,
        kot_item_id: `${kotKey}:${item.itemId}`,
        item_name: lineName,
        qty: billQty,
        unit_price: unitPrice,
        line_total: unitPrice * billQty,
        include_in_bill: true,
        removed_qty: isPartial ? Number(item.removedQty) || 0 : null,
        original_qty: isPartial ? Number(item.qty) || null : null,
        exclusion_reason: null,
      });
    });
  });
  return rows;
}

export const billingService = {
  async createBillForTable({
    tableNumber,
    waiterUserId,
    waiterUsername,
    clearedKots,
    serviceChargePct,
    taxPct,
    discountPercent = 0,
  }) {
    const session = await tableSessionRepository.getActiveByTable(tableNumber);

    const {
      subtotal,
      serviceChargeAmount,
      taxAmount,
      grandTotalBeforeDiscount,
    } = computeBillTotalsFromClearedKots(clearedKots, serviceChargePct, taxPct);

    const pct = Number(discountPercent) || 0;
    const { finalTotal } = applyDiscountPercent(grandTotalBeforeDiscount, pct);

    const billId = await billingRepository.createBill({
      session_id: session?.id || null,
      table_number: tableNumber,
      waiter_user_id: waiterUserId || null,
      waiter_username: waiterUsername || null,
      subtotal,
      service_charge: serviceChargeAmount,
      tax: taxAmount,
      total: finalTotal,
      discount_percent: pct > 0 ? pct : null,
      discount_applied_by: pct > 0 ? (waiterUserId || null) : null,
      discount_applied_at: pct > 0 ? new Date().toISOString() : null,
      printed: false,
    });
    await billingRepository.createBillItems(buildBillItemRows(billId, clearedKots));
    await auditService.log({
      actor_user_id: waiterUserId,
      action: 'create_bill',
      entity_type: 'bill',
      entity_id: billId,
      after_json: { tableNumber, total: finalTotal, discountPercent: pct || null, waiterUsername: waiterUsername || null },
    });
    return billId;
  },

  /**
   * Single source of truth when waiter clears table: upsert one bill row + line items.
   */
  async finalizeBillOnClearTable({
    tableNumber,
    waiterUserId,
    waiterUsername,
    clearedKots,
    serviceChargePct = 5,
    taxPct = 18,
    discountPercent = 0,
  }) {
    const draft = await billingRepository.getLatestDraftBillForTable(tableNumber);
    const cleared = await billingRepository.getLatestClearedBillForTable(tableNumber);
    const existing = draft || cleared;

    let servicePct = Number(serviceChargePct) || 5;
    let taxPctVal = Number(taxPct) || 18;
    let discPct = Number(discountPercent) || 0;
    if (existing) {
      const implied = ratesImpliedByBill(existing);
      if (existing.subtotal > 0) {
        servicePct = implied.serviceRate * 100;
        taxPctVal = implied.taxRate * 100;
      }
      if (existing.discount_percent != null) discPct = Number(existing.discount_percent) || 0;
    }

    const {
      subtotal,
      serviceChargeAmount,
      taxAmount,
      grandTotalBeforeDiscount,
    } = computeBillTotalsFromClearedKots(clearedKots, servicePct, taxPctVal);
    const { finalTotal } = applyDiscountPercent(grandTotalBeforeDiscount, discPct);
    const now = new Date().toISOString();
    const session = await tableSessionRepository.getActiveByTable(tableNumber);

    const payload = {
      session_id: session?.id || existing?.session_id || null,
      table_number: tableNumber,
      waiter_user_id: waiterUserId || existing?.waiter_user_id || null,
      waiter_username: waiterUsername || existing?.waiter_username || null,
      subtotal,
      service_charge: serviceChargeAmount,
      tax: taxAmount,
      total: finalTotal,
      discount_percent: discPct > 0 ? discPct : null,
      discount_applied_by: discPct > 0 ? (waiterUserId || existing?.discount_applied_by || null) : null,
      discount_applied_at: discPct > 0 ? now : null,
      cleared_at: now,
      printed: false,
    };

    let billId;
    if (existing) {
      billId = existing.id;
      await billingRepository.updateBill(billId, payload);
    } else {
      billId = await billingRepository.createBill({
        ...payload,
        created_at: now,
      });
    }

    await billingRepository.replaceBillItems(billId, buildBillItemRows(billId, clearedKots));

    await auditService.log({
      actor_user_id: waiterUserId,
      action: 'finalize_bill_on_clear',
      entity_type: 'bill',
      entity_id: billId,
      after_json: {
        tableNumber,
        total: finalTotal,
        discountPercent: discPct || null,
        waiterUsername: waiterUsername || null,
      },
    });

    return billId;
  },

  async getBillById(billId) {
    return billingRepository.getBillById(billId);
  },

  async listRecent(limit = 30) {
    return billingRepository.listRecent(limit);
  },

  async listBills({ fromDate, toDate, search } = {}) {
    return billingRepository.listBills({ fromDate, toDate, search });
  },

  // ── Audit lifecycle ───────────────────────────────────────
  async voidBill({ billId, managerUserId, reason }) {
    if (!billId) throw new Error('Bill ID is required.');
    if (!reason || !String(reason).trim()) throw new Error('A void reason is required.');
    await billingRepository.voidBill(billId, { voidedBy: managerUserId, voidReason: String(reason).trim() });
    await auditService.log({
      actor_user_id: managerUserId,
      action: 'VOID_BILL',
      entity_type: 'bill',
      entity_id: billId,
      remarks: reason,
    });
  },

  async resettleBill({ billId, managerUserId, originalPayment, newPayment }) {
    if (!billId) throw new Error('Bill ID is required.');
    await billingRepository.resettleBill(billId, {
      resettledBy: managerUserId,
      originalPayment: originalPayment || null,
      newPayment: newPayment || null,
    });
    await auditService.log({
      actor_user_id: managerUserId,
      action: 'RESETTLE_BILL',
      entity_type: 'bill',
      entity_id: billId,
      after_json: { originalPayment, newPayment },
    });
  },

  async applyDiscount({ billId, discountPercent, managerUserId }) {
    if (!billId) throw new Error('Bill ID is required.');
    const pct = Number(discountPercent);
    if (isNaN(pct) || pct < 0 || pct > 100) throw new Error('Discount must be between 0 and 100.');

    const bill = await billingRepository.getBillById(billId);
    if (!bill) throw new Error('Bill not found.');
    const newTotal = Math.round(Number(bill.total) * (1 - pct / 100) * 100) / 100;

    await billingRepository.applyDiscount(billId, {
      discountPercent: pct,
      appliedBy: managerUserId,
      newTotal,
    });
    await auditService.log({
      actor_user_id: managerUserId,
      action: 'APPLY_DISCOUNT',
      entity_type: 'bill',
      entity_id: billId,
      after_json: {
        discountPercent: pct,
        newTotal,
        tableNumber: bill.table_number,
        waiterUsername: bill.waiter_username || null,
      },
    });
    return newTotal;
  },

  // ── Audit list queries ────────────────────────────────────
  async listVoidBills({ fromDate, toDate } = {}) {
    return billingRepository.listVoidBills({ fromDate, toDate });
  },

  async listResettledBills({ fromDate, toDate } = {}) {
    return billingRepository.listResettledBills({ fromDate, toDate });
  },

  async listHighDiscountBills({ fromDate, toDate, threshold = 50 } = {}) {
    return billingRepository.listHighDiscountBills({ fromDate, toDate, threshold });
  },
};
