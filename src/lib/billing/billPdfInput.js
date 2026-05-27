import {
  applyDiscountPercent,
  combinedConsumedItemsFromClearedKots,
  computeBillTotalsFromClearedKots,
  ratesImpliedByBill,
} from './billTotals.js';

/**
 * @typedef {object} BillPdfLineItem
 * @property {string} name
 * @property {number} qty
 * @property {number} unitPrice
 * @property {number} lineTotal
 */

/**
 * @typedef {object} BillPdfInput
 * @property {string} [billId]
 * @property {number} tableNumber
 * @property {string} [waiterName]
 * @property {string} restaurantName
 * @property {string} [customerName]
 * @property {string} createdAt ISO timestamp
 * @property {BillPdfLineItem[]} items
 * @property {number} subtotal
 * @property {number} serviceCharge
 * @property {number} [serviceChargePct]
 * @property {number} tax
 * @property {number} [taxPct]
 * @property {number} [discountPercent]
 * @property {number} [discountAmount]
 * @property {number} total
 */

function mapConsumedItemToLine(item) {
  const name = item.name ?? item.itemName ?? item.item_name ?? 'Unknown item';
  const qty = Number(item.qty) || 0;
  const unitPrice = Number(item.price) || 0;
  return {
    name: String(name).trim(),
    qty,
    unitPrice,
    lineTotal: Math.round(qty * unitPrice * 100) / 100,
  };
}

/**
 * Build PDF payload from the same data used when the waiter prints/generates a bill.
 *
 * @param {object} params
 * @param {number} params.tableNumber
 * @param {Array} params.clearedKots
 * @param {number} [params.serviceChargePct]
 * @param {number} [params.taxPct]
 * @param {number} [params.discountPercent]
 * @param {string} [params.waiterName]
 * @param {string} [params.billId]
 * @param {string} params.restaurantName
 * @param {string} [params.customerName]
 * @param {string} [params.createdAt]
 * @returns {BillPdfInput}
 */
export function buildBillPdfInputFromClearedKots({
  tableNumber,
  clearedKots,
  serviceChargePct = 5,
  taxPct = 18,
  discountPercent = 0,
  waiterName,
  billId,
  restaurantName,
  customerName,
  createdAt,
}) {
  const items = combinedConsumedItemsFromClearedKots(clearedKots).map(mapConsumedItemToLine);
  const {
    subtotal,
    serviceChargeAmount,
    taxAmount,
    grandTotalBeforeDiscount,
  } = computeBillTotalsFromClearedKots(clearedKots, serviceChargePct, taxPct);
  const discPct = Number(discountPercent) || 0;
  const { discountAmt, finalTotal } = applyDiscountPercent(grandTotalBeforeDiscount, discPct);

  return {
    billId: billId || null,
    tableNumber: Number(tableNumber),
    waiterName: waiterName || null,
    restaurantName,
    customerName: customerName || null,
    createdAt: createdAt || new Date().toISOString(),
    items,
    subtotal,
    serviceCharge: serviceChargeAmount,
    serviceChargePct: Number(serviceChargePct) || 0,
    tax: taxAmount,
    taxPct: Number(taxPct) || 0,
    discountPercent: discPct > 0 ? discPct : null,
    discountAmount: discPct > 0 ? discountAmt : null,
    total: finalTotal,
  };
}

/**
 * Build PDF payload from a persisted bill + line items (e.g. after createBillForTable).
 *
 * @param {object} params
 * @param {object} params.bill DB bill row
 * @param {Array} params.billItems DB bill_items rows
 * @param {string} params.restaurantName
 * @param {string} [params.customerName]
 * @returns {BillPdfInput}
 */
export function buildBillPdfInputFromBillRecord({ bill, billItems, restaurantName, customerName }) {
  const items = (billItems || [])
    .filter((bi) => bi.include_in_bill !== false)
    .map((bi) => ({
      name: (bi.item_name && String(bi.item_name).trim()) || 'Unknown item',
      qty: Number(bi.qty) || 0,
      unitPrice: Number(bi.unit_price) || 0,
      lineTotal: Number(bi.line_total) || 0,
    }));

  const implied = ratesImpliedByBill(bill);
  const serviceChargePct =
    bill.subtotal > 0 ? Math.round(implied.serviceRate * 10000) / 100 : null;
  const taxPctVal = bill.subtotal > 0 ? Math.round(implied.taxRate * 10000) / 100 : null;
  const discPct = bill.discount_percent != null ? Number(bill.discount_percent) : 0;
  const subtotal = Number(bill.subtotal) || 0;
  const grandBefore =
    subtotal + (Number(bill.service_charge) || 0) + (Number(bill.tax) || 0);
  const { discountAmt } = applyDiscountPercent(grandBefore, discPct);

  return {
    billId: bill.id,
    tableNumber: Number(bill.table_number),
    waiterName: bill.waiter_username || null,
    restaurantName,
    customerName: customerName || null,
    createdAt: bill.cleared_at || bill.created_at || new Date().toISOString(),
    items,
    subtotal,
    serviceCharge: Number(bill.service_charge) || 0,
    serviceChargePct,
    tax: Number(bill.tax) || 0,
    taxPct: taxPctVal,
    discountPercent: discPct > 0 ? discPct : null,
    discountAmount: discPct > 0 ? discountAmt : null,
    total: Number(bill.total) || 0,
  };
}

/**
 * WhatsApp template body {{3}} — amount only (template adds ₹).
 * @param {number} amount
 */
export function formatAmountForWhatsApp(amount) {
  const n = Number(amount) || 0;
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * WhatsApp template body {{4}} — date & time.
 * @param {string|Date} isoOrDate
 */
export function formatDateTimeForWhatsApp(isoOrDate) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
