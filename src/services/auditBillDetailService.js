import { billingRepository } from '../repositories/billingRepository';
import { kotRepository } from '../repositories/kotRepository';
import { billModificationRepository } from '../repositories/billModificationRepository';
import { userRepository } from '../repositories/userRepository';
import {
  computeChargesFromSubtotal,
  ratesImpliedByBill,
  applyDiscountPercent,
} from '../lib/billing/billTotals';

function kotShort(id) {
  if (!id) return '—';
  return '#' + String(id).slice(-4).toUpperCase();
}

async function managerDisplayName(managerUserId) {
  try {
    if (!managerUserId) return 'Manager';
    const u = await userRepository.findById(managerUserId);
    if (!u) return 'Manager';
    if (u.name && String(u.name).trim()) return u.name.trim();
    if (u.username) return `@${u.username}`;
    return 'Manager';
  } catch (err) {
    throw err;
  }
}

function kotIdsFromBillItems(billItems) {
  const ids = new Set();
  for (const bi of billItems || []) {
    const kid = bi.kot_item_id;
    if (!kid || typeof kid !== 'string') continue;
    const i = kid.indexOf(':');
    if (i > 0) ids.add(kid.slice(0, i));
  }
  return [...ids];
}

/**
 * When live kot_rows are missing (deleted KOTs, empty session), rebuild audit lines
 * from persisted bill_items so item names and totals match the printed bill.
 */
function buildFallbackLinesFromBillItems(billItems) {
  const lines = [];
  let billableSubtotal = 0;
  let removedManagerValue = 0;

  for (const bi of billItems || []) {
    const qty = Number(bi.qty) || 0;
    const unit = Number(bi.unit_price) || 0;
    const name = (bi.item_name && String(bi.item_name).trim()) || 'Unknown item';
    let kotLabel = '—';
    const kid = bi.kot_item_id;
    if (kid && typeof kid === 'string') {
      const colon = kid.indexOf(':');
      kotLabel = colon > 0 ? kotShort(kid.slice(0, colon)) : kotShort(kid);
    }

    const included = bi.include_in_bill !== false;
    const excl = bi.exclusion_reason;

    if (!included && excl === 'removed_entirely') {
      const q = qty > 0 ? qty : 1;
      lines.push({
        kind: 'removed_full',
        name,
        qty: q,
        originalQty: q,
        unit,
        lineTotal: 0,
        kotLabel,
        managerName: null,
      });
      removedManagerValue += q * unit;
      continue;
    }

    if (!included) {
      lines.push({
        kind: 'oos',
        name,
        qty,
        originalQty: null,
        unit,
        lineTotal: 0,
        kotLabel,
        managerName: null,
      });
      continue;
    }

    const lineTotal = qty * unit;
    lines.push({
      kind: 'served',
      name,
      qty,
      originalQty: null,
      unit,
      lineTotal,
      kotLabel,
      managerName: null,
    });
    billableSubtotal += lineTotal;
  }

  return { lines, billableSubtotal, removedManagerValue };
}

/** Normalize dish name from DB row + bill_items snapshot (handles snake_case / camelCase / missing snapshot). */
export function resolveItemDisplayName(raw, kotId, billItems) {
  const menuId = raw?.menu_item_id ?? raw?.menuItemId;
  const kotItemKey =
    kotId && menuId != null && menuId !== ''
      ? `${kotId}:${menuId}`
      : null;
  const fromBill =
    kotItemKey && Array.isArray(billItems)
      ? billItems.find((b) => b.kot_item_id === kotItemKey)?.item_name
      : null;
  const candidates = [
    fromBill,
    raw?.item_name_snapshot,
    raw?.itemNameSnapshot,
    raw?.item_name,
    raw?.itemName,
    raw?.name,
    raw?.title,
    raw?.menu_item_name,
  ];
  for (const c of candidates) {
    if (c != null && String(c).trim() !== '') return String(c).trim();
  }
  return 'Unknown item';
}

/**
 * Rich annotated bill breakdown for manager audit / Bills tab only.
 * Reconstructs lines from live kot_items for the session + removal attributions
 * from approved bill_modification_requests tied to this bill.
 */
export async function buildAuditBillDetail(billId) {
  try {
    const bill = await billingRepository.getBillById(billId);
    if (!bill) return { error: 'Bill not found.' };

    const billItems = await billingRepository.getBillItems(billId);

    const approvedReqs = await billModificationRepository.listApprovedForBill(billId);
    /** kot_item_id (kotId:menuItemId) → approving manager display name (last wins) */
    const attribution = {};
    for (const req of approvedReqs) {
      const stored = req.approved_by_display_name && String(req.approved_by_display_name).trim();
      const mgrName = stored || (await managerDisplayName(req.reviewed_by_manager_id));
      const remList = Array.isArray(req.items_to_remove) ? req.items_to_remove : [];
      for (const rem of remList) {
        const itemId = rem.itemId;
        const itemName = rem.itemName;
        if (!itemId) continue;
        const bi =
          billItems.find(
            (b) =>
              typeof b.kot_item_id === 'string' &&
              b.kot_item_id.endsWith(`:${itemId}`) &&
              (itemName ? b.item_name === itemName || String(b.item_name || '').includes(String(itemName)) : true)
          ) ||
          billItems.find(
            (b) => typeof b.kot_item_id === 'string' && b.kot_item_id.endsWith(`:${itemId}`)
          );
        if (bi?.kot_item_id) attribution[bi.kot_item_id] = mgrName;
      }
    }

    let kots = [];
    if (bill.session_id) {
      kots = await kotRepository.listBySession(bill.session_id);
    }
    // Session can be stale or empty after clear-table; KOT rows may still exist by id.
    if (!kots.length) {
      const ids = kotIdsFromBillItems(billItems);
      kots = ids.length ? await kotRepository.listByIds(ids) : [];
    }

    const lines = [];
    let billableSubtotal = 0;
    let removedManagerValue = 0;

    for (const kot of kots) {
      const kotLabel = kotShort(kot.id);
      for (const raw of kot.items || []) {
        const name = resolveItemDisplayName(raw, kot.id, billItems);
        const unit =
          Number(raw.price_snapshot ?? raw.priceSnapshot ?? raw.unit_price) || 0;
        const origQty = Number(raw.qty) || 0;
        const status = raw.status;
        const menuId = raw.menu_item_id ?? raw.menuItemId;
        const key = `${kot.id}:${menuId}`;
        const managerName = attribution[key] || null;

        if (status === 'pending') continue;

        if (status === 'done') {
          const lineTotal = origQty * unit;
          lines.push({
            kind: 'served',
            name,
            qty: origQty,
            originalQty: null,
            unit,
            lineTotal,
            kotLabel,
            managerName: null,
          });
          billableSubtotal += lineTotal;
          continue;
        }

        if (status === 'partially_removed') {
          const finalQ = Number(raw.final_qty);
          const remQ = Number(raw.removed_qty) || 0;
          const fq = Number.isFinite(finalQ) ? finalQ : 0;
          const lineTotal = fq * unit;
          lines.push({
            kind: 'partial',
            name,
            qty: fq,
            originalQty: origQty,
            unit,
            lineTotal,
            kotLabel,
            managerName,
          });
          billableSubtotal += lineTotal;
          removedManagerValue += remQ * unit;
          continue;
        }

        if (status === 'removed_entirely') {
          lines.push({
            kind: 'removed_full',
            name,
            qty: origQty,
            originalQty: origQty,
            unit,
            lineTotal: 0,
            kotLabel,
            managerName,
          });
          removedManagerValue += origQty * unit;
          continue;
        }

        if (status === 'out_of_stock' || status === 'removed') {
          lines.push({
            kind: 'oos',
            name,
            qty: origQty,
            originalQty: null,
            unit,
            lineTotal: 0,
            kotLabel,
            managerName: null,
          });
          continue;
        }

        if (status === 'cancelled') {
          lines.push({
            kind: 'cancelled',
            name,
            qty: origQty,
            originalQty: null,
            unit,
            lineTotal: 0,
            kotLabel,
            managerName: null,
          });
          continue;
        }

        lines.push({
          kind: 'other',
          name,
          qty: origQty,
          originalQty: null,
          unit,
          lineTotal: origQty * unit,
          kotLabel,
          managerName: null,
          status,
        });
      }
    }

    if (lines.length === 0 && billItems.length > 0) {
      const fb = buildFallbackLinesFromBillItems(billItems);
      lines.push(...fb.lines);
      billableSubtotal = fb.billableSubtotal;
      removedManagerValue = fb.removedManagerValue;
    }

    const { serviceRate, taxRate } = ratesImpliedByBill(bill);
    const {
      serviceChargeAmount: serviceCharge,
      taxAmount: tax,
      grandTotalBeforeDiscount: preDiscount,
    } = computeChargesFromSubtotal(billableSubtotal, serviceRate, taxRate);
    const discPct = Number(bill.discount_percent) || 0;
    const { finalTotal: grandTotal } = applyDiscountPercent(preDiscount, discPct);

    let discountAppliedByLabel = '';
    const discUid = bill.discount_applied_by || bill.waiter_user_id;
    if (discUid) {
      const u = await userRepository.findById(discUid);
      if (u) {
        discountAppliedByLabel = u.name?.trim() || (u.username ? `@${u.username}` : '');
      }
    }

    return {
      bill: {
        id: bill.id,
        shortId: kotShort(bill.id),
        tableNumber: bill.table_number,
        billStatus: bill.bill_status,
        waiterUsername: bill.waiter_username,
        discountAppliedByLabel: discountAppliedByLabel || null,
      },
      lines,
      totals: {
        billableSubtotal,
        removedAmount: removedManagerValue,
        serviceCharge,
        tax,
        discountPercent: discPct,
        preDiscount,
        grandTotal,
      },
    };
  } catch (err) {
    throw err;
  }
}

/**
 * Manager Bills tab — bill finalized on Clear Table (stored bill_items only).
 * Shows done + partial lines only; no removed_entirely / cancelled / OOS.
 */
export async function buildManagerBillDetail(billId) {
  try {
    const bill = await billingRepository.getBillById(billId);
    if (!bill) return { error: 'Bill not found.' };

    const billItems = await billingRepository.getBillItems(billId);
    const lines = [];
    let billableSubtotal = 0;

    for (const bi of billItems || []) {
      if (bi.include_in_bill === false) continue;

      const qty = Number(bi.qty) || 0;
      const unit = Number(bi.unit_price) || 0;
      const name = (bi.item_name && String(bi.item_name).trim()) || 'Unknown item';
      const remQ = Number(bi.removed_qty) || 0;
      const origQ = Number(bi.original_qty);
      let kotLabel = '—';
      const kid = bi.kot_item_id;
      if (kid && typeof kid === 'string') {
        const colon = kid.indexOf(':');
        kotLabel = colon > 0 ? kotShort(kid.slice(0, colon)) : kotShort(kid);
      }

      const lineTotal = qty * unit;
      if (remQ > 0 && Number.isFinite(origQ) && origQ > qty) {
        lines.push({
          kind: 'partial',
          name,
          qty,
          originalQty: origQ,
          unit,
          lineTotal,
          kotLabel,
          managerName: null,
        });
      } else {
        lines.push({
          kind: 'served',
          name,
          qty,
          originalQty: null,
          unit,
          lineTotal,
          kotLabel,
          managerName: null,
        });
      }
      billableSubtotal += lineTotal;
    }

    const { serviceRate, taxRate } = ratesImpliedByBill(bill);
    const {
      serviceChargeAmount: serviceCharge,
      taxAmount: tax,
      grandTotalBeforeDiscount: preDiscount,
    } = computeChargesFromSubtotal(billableSubtotal, serviceRate, taxRate);
    const discPct = Number(bill.discount_percent) || 0;
    const { finalTotal: grandTotal } = applyDiscountPercent(preDiscount, discPct);

    return {
      bill: {
        id: bill.id,
        shortId: kotShort(bill.id),
        tableNumber: bill.table_number,
        billStatus: null,
        waiterUsername: bill.waiter_username,
        discountAppliedByLabel: null,
      },
      lines,
      totals: {
        billableSubtotal: Number(bill.subtotal) || billableSubtotal,
        removedAmount: 0,
        serviceCharge: Number(bill.service_charge) || serviceCharge,
        tax: Number(bill.tax) || tax,
        discountPercent: discPct,
        preDiscount: Number(bill.subtotal) + Number(bill.service_charge) + Number(bill.tax) || preDiscount,
        grandTotal: Number(bill.total) || grandTotal,
      },
    };
  } catch (err) {
    throw err;
  }
}
