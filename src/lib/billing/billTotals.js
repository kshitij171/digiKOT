/**
 * Single source of truth for bill totals from consumed (cleared) KOT items.
 * Used by waiter billing/print and manager audit reconstruction.
 */

const EXCLUDED_FROM_BILL = new Set(['removed_entirely', 'cancelled', 'out_of_stock', 'removed']);

/**
 * Lines that count toward the customer's bill: `done` at full qty,
 * `partially_removed` at finalQty only.
 *
 * @param {Array<{ items?: object[] }>} clearedKots
 */
export function billableLinesFromClearedKots(clearedKots) {
  const lines = [];
  (clearedKots || []).forEach((kot) => {
    (kot.items || []).forEach((item) => {
      const st = item.status;
      if (EXCLUDED_FROM_BILL.has(st)) return;
      const unitPrice = Number(item.price) || 0;
      if (st === 'done') {
        const q = Number(item.qty) || 0;
        if (q > 0) lines.push({ item, billQty: q, unitPrice });
      } else if (st === 'partially_removed') {
        const q = Number(item.finalQty);
        if (Number.isFinite(q) && q > 0) {
          lines.push({ item: { ...item, qty: q }, billQty: q, unitPrice });
        }
      }
    });
  });
  return lines;
}

export function subtotalFromBillableLines(lines) {
  return lines.reduce((s, l) => s + l.unitPrice * l.billQty, 0);
}

/**
 * @param {number} subtotal
 * @param {number} serviceRate decimal e.g. 0.05
 * @param {number} taxRate decimal
 */
export function computeChargesFromSubtotal(subtotal, serviceRate, taxRate) {
  const s = Math.max(0, Number(subtotal) || 0);
  const sr = Number(serviceRate) || 0;
  const tr = Number(taxRate) || 0;
  const serviceChargeAmount = Math.round(s * sr * 100) / 100;
  const taxAmount = Math.round(s * tr * 100) / 100;
  const grandTotalBeforeDiscount = Math.round((s + serviceChargeAmount + taxAmount) * 100) / 100;
  return {
    subtotal: s,
    serviceChargeAmount,
    taxAmount,
    grandTotalBeforeDiscount,
  };
}

export function ratesFromPercentages(serviceChargePct, taxPct) {
  return {
    serviceRate: (Number(serviceChargePct) || 0) / 100,
    taxRate: (Number(taxPct) || 0) / 100,
  };
}

/** Match historical bill: rates implied by stored subtotal + charges */
export function ratesImpliedByBill(bill) {
  const orig = Number(bill.subtotal) || 0;
  if (orig <= 0) return { serviceRate: 0, taxRate: 0 };
  return {
    serviceRate: Number(bill.service_charge) / orig,
    taxRate: Number(bill.tax) / orig,
  };
}

export function computeBillTotalsFromClearedKots(clearedKots, serviceChargePct, taxPct) {
  const billableLines = billableLinesFromClearedKots(clearedKots);
  const subtotal = subtotalFromBillableLines(billableLines);
  const { serviceRate, taxRate } = ratesFromPercentages(serviceChargePct, taxPct);
  const out = computeChargesFromSubtotal(subtotal, serviceRate, taxRate);
  return { ...out, billableLines };
}

/** Print / removal-modal: billable rows with qty = billed qty (one row per KOT line). */
export function combinedConsumedItemsFromClearedKots(clearedKots) {
  const lines = [];
  (clearedKots || []).forEach((kot) => {
    const kotId = kot._docId || kot.id;
    billableLinesFromClearedKots([kot]).forEach(({ item, billQty }) => {
      lines.push({
        ...item,
        qty: billQty,
        kotId,
      });
    });
  });
  return lines;
}

export function applyDiscountPercent(grandTotalBeforeDiscount, discountPct) {
  const g = Number(grandTotalBeforeDiscount) || 0;
  const p = Number(discountPct) || 0;
  const discountAmt = Math.round(g * (p / 100) * 100) / 100;
  const finalTotal = Math.round((g - discountAmt) * 100) / 100;
  return { discountAmt, finalTotal };
}
