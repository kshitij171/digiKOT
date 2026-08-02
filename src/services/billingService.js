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
  /**
   * Creates a bill for a table from cleared KOTs.
   * @param {object} args
   * @param {number} args.tableNumber
   * @param {string|null} args.waiterUserId
   * @param {string|null} args.waiterUsername
   * @param {Array<object>} args.clearedKots
   * @param {number} args.serviceChargePct
   * @param {number} args.taxPct
   * @param {number} [args.discountPercent=0]
   * @returns {Promise<string>} Created bill id.
   */
  async createBillForTable({
    tableNumber,
    waiterUserId,
    waiterUsername,
    clearedKots,
    serviceChargePct,
    taxPct,
    discountPercent = 0,
  }) {
    try {
      const session = await tableSessionRepository.getActiveByTable(tableNumber);
      // Reuse a non-void draft when still valid (e.g. reprint / WhatsApp / removal).
      const existing = await billingRepository.getLatestDraftBillForTable(tableNumber);

      const {
        subtotal,
        serviceChargeAmount,
        taxAmount,
        grandTotalBeforeDiscount,
      } = computeBillTotalsFromClearedKots(clearedKots, serviceChargePct, taxPct);

      const pct = Number(discountPercent) || 0;
      const { finalTotal } = applyDiscountPercent(grandTotalBeforeDiscount, pct);
      const now = new Date().toISOString();

      const payload = {
        session_id: session?.id || existing?.session_id || null,
        table_number: tableNumber,
        waiter_user_id: waiterUserId || existing?.waiter_user_id || null,
        waiter_username: waiterUsername || existing?.waiter_username || null,
        subtotal,
        service_charge: serviceChargeAmount,
        tax: taxAmount,
        total: finalTotal,
        discount_percent: pct > 0 ? pct : null,
        discount_applied_by: pct > 0 ? (waiterUserId || existing?.discount_applied_by || null) : null,
        discount_applied_at: pct > 0 ? now : null,
      };

      let billId;
      if (existing) {
        billId = existing.id;
        await billingRepository.updateBill(billId, payload);
        await billingRepository.replaceBillItems(billId, buildBillItemRows(billId, clearedKots));
        await auditService.log({
          actor_user_id: waiterUserId,
          action: 'update_bill',
          entity_type: 'bill',
          entity_id: billId,
          after_json: { tableNumber, total: finalTotal, discountPercent: pct || null, waiterUsername: waiterUsername || null },
        });
      } else {
        billId = await billingRepository.createBill({
          ...payload,
          printed: false,
          created_at: now,
        });
        await billingRepository.createBillItems(buildBillItemRows(billId, clearedKots));
        await auditService.log({
          actor_user_id: waiterUserId,
          action: 'create_bill',
          entity_type: 'bill',
          entity_id: billId,
          after_json: { tableNumber, total: finalTotal, discountPercent: pct || null, waiterUsername: waiterUsername || null },
        });
      }
      return billId;
    } catch (err) {
      throw err;
    }
  },

  /**
   * Latest non-void draft bill for a table (print / WhatsApp / removal).
   * @param {number} tableNumber
   * @returns {Promise<object|null>}
   */
  async getLatestDraftBillForTable(tableNumber) {
    try {
      return billingRepository.getLatestDraftBillForTable(tableNumber);
    } catch (err) {
      throw err;
    }
  },

  /**
   * Marks a bill as printed.
   * @param {string} billId
   * @returns {Promise<void>}
   */
  async markPrinted(billId) {
    try {
      if (!billId) return;
      await billingRepository.markPrinted(billId);
    } catch (err) {
      throw err;
    }
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
    try {
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
      return billingRepository.getBillById(billId);
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
      return billingRepository.listRecent(limit);
    } catch (err) {
      throw err;
    }
  },

  /**
   * Lists bills for manager Bills tab.
   * @param {object} [args]
   * @param {string|null} [args.fromDate]
   * @param {string|null} [args.toDate]
   * @param {string|null} [args.search]
   * @returns {Promise<Array<object>>}
   */
  async listBills({ fromDate, toDate, search } = {}) {
    try {
      return billingRepository.listBills({ fromDate, toDate, search });
    } catch (err) {
      throw err;
    }
  },

  // ── Audit lifecycle ───────────────────────────────────────
  /**
   * Voids a bill and writes an audit log entry.
   * @param {object} args
   * @param {string} args.billId
   * @param {string} args.managerUserId
   * @param {string} args.reason
   * @returns {Promise<void>}
   */
  async voidBill({ billId, managerUserId, reason }) {
    try {
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
    } catch (err) {
      throw err;
    }
  },

  /**
   * Resettles a bill payment method and records audit.
   * @param {object} args
   * @param {string} args.billId
   * @param {string} args.managerUserId
   * @param {string|null} [args.originalPayment]
   * @param {string|null} [args.newPayment]
   * @returns {Promise<void>}
   */
  async resettleBill({ billId, managerUserId, originalPayment, newPayment }) {
    try {
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
    } catch (err) {
      throw err;
    }
  },

  /**
   * Applies a percentage discount to a bill and records audit.
   * @param {object} args
   * @param {string} args.billId
   * @param {number|string} args.discountPercent
   * @param {string} args.managerUserId
   * @returns {Promise<number>} New total.
   */
  async applyDiscount({ billId, discountPercent, managerUserId }) {
    try {
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
    } catch (err) {
      throw err;
    }
  },

  // ── Audit list queries ────────────────────────────────────
  /**
   * Lists void bills within a date range.
   * @param {object} [args]
   * @param {string|null} [args.fromDate]
   * @param {string|null} [args.toDate]
   * @returns {Promise<Array<object>>}
   */
  async listVoidBills({ fromDate, toDate } = {}) {
    try {
      return billingRepository.listVoidBills({ fromDate, toDate });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Lists resettled bills within a date range.
   * @param {object} [args]
   * @param {string|null} [args.fromDate]
   * @param {string|null} [args.toDate]
   * @returns {Promise<Array<object>>}
   */
  async listResettledBills({ fromDate, toDate } = {}) {
    try {
      return billingRepository.listResettledBills({ fromDate, toDate });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Lists bills above a discount threshold within a date range.
   * @param {object} [args]
   * @param {string|null} [args.fromDate]
   * @param {string|null} [args.toDate]
   * @param {number} [args.threshold=50]
   * @returns {Promise<Array<object>>}
   */
  async listHighDiscountBills({ fromDate, toDate, threshold = 50 } = {}) {
    try {
      return billingRepository.listHighDiscountBills({ fromDate, toDate, threshold });
    } catch (err) {
      throw err;
    }
  },
};
