import { cancelRepository } from '../repositories/cancelRepository';
import { billModificationRepository } from '../repositories/billModificationRepository';
import { userRepository } from '../repositories/userRepository';
import { buildAuditBillDetail } from './auditBillDetailService';

function kotShort(id) {
  if (!id) return '—';
  return '#' + String(id).slice(-4).toUpperCase();
}

async function userLabel(userId) {
  try {
    if (!userId) return { username: '—', fullName: '—' };
    const u = await userRepository.findById(userId);
    if (!u) return { username: '—', fullName: '(removed user)' };
    return {
      username: u.username ? `@${u.username}` : '—',
      fullName: u.name || '—',
    };
  } catch (err) {
    throw err;
  }
}

function itemsLineFromRemovalJson(itemsToRemove) {
  const list = Array.isArray(itemsToRemove) ? itemsToRemove : [];
  if (!list.length) return '—';
  return list
    .map((i) => {
      const name = i.itemName ?? i.name ?? 'Item';
      const q = Number(i.qty) || 0;
      return `${name} × ${q}`;
    })
    .join(', ');
}

/** Discount % from audit log, if this log represents a discounted bill. */
export function getDiscountPercentFromLog(log) {
  const j = log.after_json;
  if (!j || typeof j !== 'object') return null;
  if (log.action === 'create_bill' && j.discountPercent != null && Number(j.discountPercent) > 0) {
    return Number(j.discountPercent);
  }
  if (log.action === 'APPLY_DISCOUNT' && j.discountPercent != null) {
    return Number(j.discountPercent);
  }
  return null;
}

/**
 * Which checkbox filters apply to this log. Returns keys matching Manager UI filters.
 * cancel_kot | bill_mod_reject | discount_gt50 | discount_100
 */
export function getFeedCategories(log) {
  const a = log.action;
  if (a === 'BILL_MODIFICATION_REJECTED') return ['bill_mod_reject'];
  if (a === 'approve_cancel' || a === 'reject_cancel') return ['cancel_kot'];
  const pct = getDiscountPercentFromLog(log);
  if (pct != null && pct === 100) return ['discount_100'];
  if (pct != null && pct > 50 && pct < 100) return ['discount_gt50'];
  return [];
}

/** True if this log should appear in the unified audit feed at all. */
export function isFeedEntry(log) {
  return getFeedCategories(log).length > 0;
}

/** One-line summary for collapsed row (no extra network). */
export function collapsedSummaryLine(log) {
  const j = log.after_json || {};
  const time = log.created_at ? new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';

  if (log.action === 'approve_cancel' || log.action === 'reject_cancel') {
    const kot = kotShort(j.kotId || j.kot_id);
    const tbl = j.tableNumber != null ? j.tableNumber : '?';
    const who = j.waiterUsername ? `@${j.waiterUsername}` : 'waiter';
    const verb = log.action === 'approve_cancel' ? 'approved' : 'rejected';
    return { text: `KOT ${kot} cancellation ${verb} — Table ${tbl} · Waiter: ${who}`, time };
  }
  const pct = getDiscountPercentFromLog(log);
  if (pct != null && pct > 50) {
    const tbl = j.tableNumber ?? '?';
    const who = j.waiterUsername ? `@${j.waiterUsername}` : 'staff';
    const bill = kotShort(log.entity_id);
    return { text: `${pct}% discount — Bill ${bill} · Table ${tbl} · ${who}`, time };
  }

  if (log.action === 'BILL_MODIFICATION_REJECTED') {
    const tbl = j.tableNumber != null ? j.tableNumber : '?';
    const itemsSummary =
      j.itemsSummary ||
      itemsLineFromRemovalJson(j.itemsToRemove) ||
      '—';
    const reason =
      (log.remarks || j.rejectionReason || '').trim() || 'No reason provided';
    const mgr = j.rejectedByDisplayName || 'manager';
    const tsIso = j.reviewedAtIso || log.created_at;
    const ts = tsIso ? new Date(tsIso).toLocaleString() : '';
    return {
      text: `Removal request rejected — ${itemsSummary} for Table ${tbl}`,
      time,
      extraLines: [
        { text: `Reason: ${reason}`, muted: true, italic: true },
        { text: `Rejected by ${mgr} at ${ts}`, muted: true },
      ],
    };
  }

  return { text: `${log.action}`, time };
}

/** Icon emoji per category primary type */
export function collapsedIcon(log) {
  const cats = getFeedCategories(log);
  if (cats.includes('bill_mod_reject')) return '📋';
  if (cats.includes('cancel_kot')) return log.action === 'approve_cancel' ? '✓' : '✕';
  if (cats.includes('discount_100')) return '💯';
  if (cats.includes('discount_gt50')) return '🏷️';
  return '•';
}

/**
 * Load full detail for expanded panel.
 */
export async function loadExpandedDetail(log) {
  try {
    if (log.action === 'approve_cancel' || log.action === 'reject_cancel') {
      const req = await cancelRepository.findById(log.entity_id);
      if (!req) {
        return { type: 'cancel', error: 'Cancel request not found (it may have been purged).' };
      }
      const [waiter, kitchen] = await Promise.all([
        userLabel(req.waiter_user_id),
        userLabel(req.reviewed_by_user_id),
      ]);
      const itemsLine = `• ${req.item_name} ×${req.qty}`;
      return {
        type: 'cancel',
        fields: {
          'KOT number': kotShort(req.kot_id),
          'Table number': String(req.table_number),
          'Items cancelled': itemsLine,
          'Waiter (request)': `${waiter.username} — ${waiter.fullName}`,
          'Kitchen supervisor': `${kitchen.username} — ${kitchen.fullName}`,
          Decision: log.action === 'approve_cancel' ? 'Approved' : 'Rejected',
          'Waiter reason': req.reason || '—',
          'Kitchen rejection note':
            log.action === 'reject_cancel'
              ? '— (optional note not stored in DB for kitchen rejections)'
              : '—',
          'Request time': req.requested_at ? new Date(req.requested_at).toLocaleString() : '—',
          'Decision time': req.reviewed_at ? new Date(req.reviewed_at).toLocaleString() : '—',
        },
      };
    }

    if (log.action === 'BILL_MODIFICATION_REJECTED') {
      const req = await billModificationRepository.getById(log.entity_id);
      const j = log.after_json || {};
      const tbl = req?.table_number ?? j.tableNumber ?? '?';
      const itemsSummary =
        itemsLineFromRemovalJson(req?.items_to_remove) ||
        j.itemsSummary ||
        '—';
      const reasonRaw =
        (req?.rejection_reason && String(req.rejection_reason).trim()) ||
        (log.remarks && String(log.remarks).trim()) ||
        (j.rejectionReason && String(j.rejectionReason).trim()) ||
        '';
      const reasonLine = reasonRaw || 'No reason provided';
      let mgr =
        (req?.rejected_by_display_name && String(req.rejected_by_display_name).trim()) ||
        j.rejectedByDisplayName ||
        null;
      if (!mgr && req?.reviewed_by_manager_id) {
        mgr = (await userLabel(req.reviewed_by_manager_id)).fullName;
      }
      mgr = mgr || 'manager';
      const tsRaw = req?.rejected_at || req?.reviewed_at || j.reviewedAtIso || log.created_at;
      const ts = tsRaw ? new Date(tsRaw).toLocaleString() : '—';
      return {
        type: 'bill_mod_reject',
        headline: `Removal request rejected — ${itemsSummary} for Table ${tbl}`,
        reasonLine,
        rejectedLine: `Rejected by ${mgr} at ${ts}`,
      };
    }

    const pct = getDiscountPercentFromLog(log);
    if (pct != null && pct > 50 && log.entity_type === 'bill') {
      const auditBill = await buildAuditBillDetail(log.entity_id);
      if (auditBill.error) {
        return { type: 'audit_bill', pct, auditBill: { error: auditBill.error } };
      }
      return { type: 'audit_bill', pct, auditBill };
    }

    return { type: 'unknown', error: 'No extra details for this entry type.' };
  } catch (err) {
    throw err;
  }
}
