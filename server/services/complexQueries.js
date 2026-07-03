import { getDb } from '../db/sqlite.js';
import { fromBps, fromPaise } from '../lib/money.js';

function mapBill(row) {
  if (!row) return row;
  return {
    ...row,
    subtotal: fromPaise(row.subtotal_paise),
    service_charge: fromPaise(row.service_charge_paise),
    tax: fromPaise(row.tax_paise),
    total: fromPaise(row.total_paise),
    discount_percent: fromBps(row.discount_percent_bps),
    printed: Boolean(row.printed),
  };
}

function mapBillItem(row) {
  if (!row) return row;
  return {
    ...row,
    unit_price: fromPaise(row.unit_price_paise),
    line_total: fromPaise(row.line_total_paise),
    include_in_bill: Boolean(row.include_in_bill),
  };
}

function mapUser(row) {
  if (!row) return row;
  return { ...row, active: Boolean(row.active) };
}

function attachBillItems(bills) {
  const db = getDb();
  return bills.map((b) => {
    const items = db
      .prepare('SELECT * FROM bill_items WHERE bill_id = ?')
      .all(b.id)
      .map(mapBillItem);
    return { ...mapBill(b), bill_items: items };
  });
}

function attachKotItems(kots) {
  const db = getDb();
  return kots.map((k) => {
    const items = db
      .prepare('SELECT * FROM kot_items WHERE kot_id = ?')
      .all(k.id)
      .map((i) => ({
        ...i,
        price_snapshot: fromPaise(i.price_snapshot_paise),
      }));
    return { ...k, items };
  });
}

export const complexQueries = {
  listClearedBills({ fromDate, toDate, search } = {}) {
    const db = getDb();
    const clauses = ['cleared_at IS NOT NULL'];
    const params = [];
    if (fromDate) { clauses.push('cleared_at >= ?'); params.push(fromDate); }
    if (toDate) { clauses.push('cleared_at <= ?'); params.push(toDate); }
    if (search?.trim()) {
      const s = `%${search.trim()}%`;
      clauses.push('(waiter_username LIKE ? COLLATE NOCASE OR id LIKE ? COLLATE NOCASE)');
      params.push(s, s);
    }
    const sql = `SELECT * FROM bills WHERE ${clauses.join(' AND ')} ORDER BY cleared_at DESC LIMIT 500`;
    return attachBillItems(db.prepare(sql).all(...params));
  },

  getLatestDraftBillForTable(tableNumber) {
    const db = getDb();
    const row = db
      .prepare(
        `SELECT * FROM bills WHERE table_number = ? AND cleared_at IS NULL ORDER BY created_at DESC LIMIT 1`
      )
      .get(tableNumber);
    return row ? mapBill(row) : null;
  },

  getLatestClearedBillForTable(tableNumber) {
    const db = getDb();
    const row = db
      .prepare(
        `SELECT * FROM bills WHERE table_number = ? AND cleared_at IS NOT NULL ORDER BY cleared_at DESC LIMIT 1`
      )
      .get(tableNumber);
    return row ? mapBill(row) : null;
  },

  listVoidBills({ fromDate, toDate } = {}) {
    const db = getDb();
    const clauses = ["bill_status = 'void'"];
    const params = [];
    if (fromDate) { clauses.push('voided_at >= ?'); params.push(fromDate); }
    if (toDate) { clauses.push('voided_at <= ?'); params.push(toDate); }
    const sql = `SELECT * FROM bills WHERE ${clauses.join(' AND ')} ORDER BY voided_at DESC LIMIT 200`;
    return db.prepare(sql).all(...params).map(mapBill);
  },

  listResettledBills({ fromDate, toDate } = {}) {
    const db = getDb();
    const clauses = ["bill_status = 'resettled'"];
    const params = [];
    if (fromDate) { clauses.push('resettled_at >= ?'); params.push(fromDate); }
    if (toDate) { clauses.push('resettled_at <= ?'); params.push(toDate); }
    const sql = `SELECT * FROM bills WHERE ${clauses.join(' AND ')} ORDER BY resettled_at DESC LIMIT 200`;
    return db.prepare(sql).all(...params).map(mapBill);
  },

  listHighDiscountBills({ fromDate, toDate, threshold = 50 } = {}) {
    const db = getDb();
    const thresholdBps = Math.round(threshold * 100);
    const clauses = ['discount_percent_bps > ?'];
    const params = [thresholdBps];
    if (fromDate) { clauses.push('discount_applied_at >= ?'); params.push(fromDate); }
    if (toDate) { clauses.push('discount_applied_at <= ?'); params.push(toDate); }
    const sql = `SELECT * FROM bills WHERE ${clauses.join(' AND ')} ORDER BY discount_applied_at DESC LIMIT 200`;
    return db.prepare(sql).all(...params).map(mapBill);
  },

  listUsers() {
    const db = getDb();
    return db
      .prepare('SELECT * FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC')
      .all()
      .map(mapUser);
  },

  findByUsernameAdmin(username) {
    const db = getDb();
    const normalized = String(username || '').trim().toLowerCase();
    const row = db
      .prepare('SELECT * FROM users WHERE LOWER(username) = ? LIMIT 1')
      .get(normalized);
    return row ? mapUser(row) : null;
  },

  updatePinByUserId(userId, pinHash) {
    const db = getDb();
    const updatedAt = new Date().toISOString();
    const result = db
      .prepare(
        `UPDATE users SET pin_hash = ?, active = 1, deleted_at = NULL, updated_at = ? WHERE id = ?`
      )
      .run(pinHash, updatedAt, userId);
    const updated = db.prepare('SELECT id, username, active, deleted_at FROM users WHERE id = ?').get(userId);
    return { rowsAffected: result.changes, updatedUsername: updated?.username ?? null };
  },

  codeExists(code) {
    const db = getDb();
    const row = db.prepare('SELECT id FROM users WHERE code = ? LIMIT 1').get(code);
    return row != null;
  },

  listAllPinHashes() {
    const db = getDb();
    return db.prepare('SELECT pin_hash FROM users').all().map((r) => r.pin_hash).filter(Boolean);
  },

  listClearedBySupervisor(supervisorId, { offset = 0, limit = 20 } = {}) {
    if (!supervisorId) return { rows: [], total: 0 };
    const db = getDb();
    const total = db
      .prepare(`SELECT COUNT(*) AS c FROM kots WHERE status = 'cleared' AND supervisor_id = ?`)
      .get(supervisorId).c;
    const rows = db
      .prepare(
        `SELECT * FROM kots WHERE status = 'cleared' AND supervisor_id = ?
         ORDER BY cleared_at DESC LIMIT ? OFFSET ?`
      )
      .all(supervisorId, limit, offset);
    return { rows: attachKotItems(rows), total };
  },

  listCancelledKots({ fromDate, toDate } = {}) {
    const db = getDb();
    const clauses = ["status = 'cancelled'"];
    const params = [];
    if (fromDate) { clauses.push('cancelled_at >= ?'); params.push(fromDate); }
    if (toDate) { clauses.push('cancelled_at <= ?'); params.push(toDate); }
    const sql = `SELECT * FROM kots WHERE ${clauses.join(' AND ')} ORDER BY cancelled_at DESC LIMIT 200`;
    return attachKotItems(db.prepare(sql).all(...params));
  },

  assignSupervisor(kotId, supervisorId, supervisorName) {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE kots SET supervisor_id = ?, supervisor_name = ?, assigned_at = ?, updated_at = ?
       WHERE id = ? AND supervisor_id IS NULL`
    ).run(supervisorId, supervisorName || null, now, now, kotId);
  },

  listBillModForManager(managerUserId, limit = 200) {
    const db = getDb();
    return db
      .prepare(
        `SELECT * FROM bill_modification_requests
         WHERE status = 'pending' OR reviewed_by_manager_id = ?
         ORDER BY requested_at DESC LIMIT ?`
      )
      .all(managerUserId, limit)
      .map((r) => ({
        ...r,
        items_to_remove: typeof r.items_to_remove === 'string' ? JSON.parse(r.items_to_remove) : r.items_to_remove,
      }));
  },
};
