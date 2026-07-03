import { getDb } from '../db/sqlite.js';
import { fromBps, fromPaise, toBps, toPaise } from '../lib/money.js';

const BOOL_COLS = new Set([
  'active', 'printed', 'is_vegetarian', 'out_of_stock', 'include_in_bill',
]);

const MONEY_TO_PAISE = {
  price: 'price_paise',
  price_snapshot: 'price_snapshot_paise',
  subtotal: 'subtotal_paise',
  service_charge: 'service_charge_paise',
  tax: 'tax_paise',
  total: 'total_paise',
  unit_price: 'unit_price_paise',
  line_total: 'line_total_paise',
};

const PAISE_TO_MONEY = Object.fromEntries(
  Object.entries(MONEY_TO_PAISE).map(([k, v]) => [v, k])
);

const JSON_COLS = new Set(['payload_json', 'before_json', 'after_json', 'items_to_remove']);

function translateRowToDb(table, row) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  for (const [dec, paise] of Object.entries(MONEY_TO_PAISE)) {
    if (dec in out) {
      out[paise] = toPaise(out[dec]);
      delete out[dec];
    }
  }
  if ('discount_percent' in out) {
    out.discount_percent_bps = toBps(out.discount_percent);
    delete out.discount_percent;
  }
  for (const col of BOOL_COLS) {
    if (col in out) out[col] = out[col] ? 1 : 0;
  }
  for (const col of JSON_COLS) {
    if (col in out && out[col] !== null && typeof out[col] === 'object') {
      out[col] = JSON.stringify(out[col]);
    }
  }
  return out;
}

function translateRowFromDb(row) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  for (const [paise, dec] of Object.entries(PAISE_TO_MONEY)) {
    if (paise in out) {
      out[dec] = fromPaise(out[paise]);
      delete out[paise];
    }
  }
  if ('discount_percent_bps' in out) {
    out.discount_percent = fromBps(out.discount_percent_bps);
    delete out.discount_percent_bps;
  }
  for (const col of BOOL_COLS) {
    if (col in out) out[col] = Boolean(out[col]);
  }
  for (const col of JSON_COLS) {
    if (col in out && typeof out[col] === 'string') {
      try { out[col] = JSON.parse(out[col]); } catch { /* keep string */ }
    }
  }
  return out;
}

function buildWhere(filters) {
  const clauses = [];
  const params = [];
  for (const f of filters || []) {
    const col = f.column;
    const op = f.operator || 'eq';
    if (op === 'eq') {
      let val = f.value;
      if (BOOL_COLS.has(col) && typeof val === 'boolean') val = val ? 1 : 0;
      clauses.push(`${col} = ?`);
      params.push(val);
    } else if (op === 'in') {
      const placeholders = f.value.map(() => '?').join(', ');
      clauses.push(`${col} IN (${placeholders})`);
      params.push(...f.value);
    } else if (op === 'is') {
      clauses.push(f.value === null ? `${col} IS NULL` : `${col} IS NOT NULL`);
    } else if (op === 'ilike') {
      clauses.push(`${col} LIKE ? COLLATE NOCASE`);
      params.push(`%${f.value}%`);
    } else if (op === 'gte') {
      clauses.push(`${col} >= ?`);
      params.push(f.value);
    } else if (op === 'lte') {
      clauses.push(`${col} <= ?`);
      params.push(f.value);
    } else if (op === 'gt') {
      clauses.push(`${col} > ?`);
      params.push(f.value);
    }
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export const sqliteAdapter = {
  select(table, options = {}) {
    const db = getDb();
    const {
      columns = '*',
      filters = [],
      orderBy = null,
      ascending = true,
      limit = null,
      single = false,
    } = options;

    const { sql: whereSql, params } = buildWhere(filters);
    let sql = `SELECT ${columns} FROM ${table} ${whereSql}`;
    if (orderBy) sql += ` ORDER BY ${orderBy} ${ascending ? 'ASC' : 'DESC'}`;
    if (limit) sql += ` LIMIT ${limit}`;

    const rows = db.prepare(sql).all(...params).map(translateRowFromDb);
    if (single) return rows[0] ?? null;
    return rows;
  },

  insert(table, payload) {
    const db = getDb();
    const rows = Array.isArray(payload) ? payload : [payload];
    const results = [];
    for (const raw of rows) {
      const row = translateRowToDb(table, raw);
      const cols = Object.keys(row);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`;
      db.prepare(sql).run(...cols.map((c) => row[c]));
      results.push(translateRowFromDb(row));
    }
    return results;
  },

  update(table, payload, filters = []) {
    const db = getDb();
    const row = translateRowToDb(table, payload);
    const sets = Object.keys(row).map((c) => `${c} = ?`).join(', ');
    const { sql: whereSql, params: whereParams } = buildWhere(filters);
    const cols = Object.keys(row);
    const sql = `UPDATE ${table} SET ${sets} ${whereSql}`;
    db.prepare(sql).run(...cols.map((c) => row[c]), ...whereParams);
    return this.select(table, { filters, single: filters.length === 1 });
  },

  delete(table, filters = []) {
    const db = getDb();
    const { sql: whereSql, params } = buildWhere(filters);
    const sql = `DELETE FROM ${table} ${whereSql}`;
    db.prepare(sql).run(...params);
    return [];
  },
};
