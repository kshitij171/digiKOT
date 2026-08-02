#!/usr/bin/env node
/**
 * Import JSON export into SQLite digikot.db
 * Usage: npm run db:import [-- --dir=server/db/fixtures/export]
 */
import fs from 'node:fs';
import path from 'node:path';
import { migrate } from '../server/db/migrate.js';
import { getDb } from '../server/db/sqlite.js';
import { toBps, toPaise } from '../server/lib/money.js';

const IMPORT_ORDER = [
  'users', 'categories', 'menu_items', 'restaurant_tables', 'table_sessions',
  'waiter_sessions', 'kots', 'kot_items', 'kot_actions', 'cancel_requests',
  'bills', 'bill_items', 'bill_modification_requests', 'notifications',
  'audit_logs', 'postprep_adjustments', 'pager_devices', 'pager_assignments',
];

const MONEY = {
  menu_items: { price: 'price_paise' },
  kot_items: { price_snapshot: 'price_snapshot_paise' },
  bills: {
    subtotal: 'subtotal_paise', service_charge: 'service_charge_paise',
    tax: 'tax_paise', total: 'total_paise', discount_percent: 'discount_percent_bps',
  },
  bill_items: { unit_price: 'unit_price_paise', line_total: 'line_total_paise' },
};

const BOOL = new Set(['active', 'printed', 'is_vegetarian', 'out_of_stock', 'include_in_bill']);
const JSON_COLS = new Set(['payload_json', 'before_json', 'after_json', 'items_to_remove']);

function transformRow(table, row) {
  const out = { ...row };
  const money = MONEY[table] || {};
  for (const [dec, col] of Object.entries(money)) {
    if (dec in out) {
      out[col] = dec === 'discount_percent' ? toBps(out[dec]) : toPaise(out[dec]);
      delete out[dec];
    }
  }
  for (const c of BOOL) {
    if (c in out) out[c] = out[c] ? 1 : 0;
  }
  for (const c of JSON_COLS) {
    if (c in out && out[c] !== null && typeof out[c] === 'object') {
      out[c] = JSON.stringify(out[c]);
    }
  }
  return out;
}

function main() {
  const dirArg = process.argv.find((a) => a.startsWith('--dir='));
  const dir = path.resolve(dirArg?.split('=')[1] || 'server/db/fixtures/export');
  if (!fs.existsSync(dir)) {
    console.error(`Export dir not found: ${dir}. Run npm run db:export first.`);
    process.exit(1);
  }

  migrate();
  const db = getDb();

  const tx = db.transaction(() => {
    for (const table of IMPORT_ORDER) {
      const file = path.join(dir, `${table}.json`);
      if (!fs.existsSync(file)) continue;
      const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!rows.length) continue;
      db.prepare(`DELETE FROM ${table}`).run();
      for (const raw of rows) {
        const row = transformRow(table, raw);
        const cols = Object.keys(row);
        const ph = cols.map(() => '?').join(', ');
        db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${ph})`).run(...cols.map((c) => row[c]));
      }
      console.log(`Imported ${table}: ${rows.length}`);
    }
  });
  tx();
  console.log('Import complete.');
}

main();
