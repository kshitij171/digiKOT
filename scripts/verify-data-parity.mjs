#!/usr/bin/env node
/**
 * Verify SQLite data vs export manifest + semantic checks.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../server/db/sqlite.js';
import { fromPaise } from '../server/lib/money.js';

const dir = path.resolve(
  process.argv.find((a) => a.startsWith('--dir='))?.split('=')[1] || 'server/db/fixtures/export'
);

function main() {
  const db = getDb();
  let ok = true;

  if (fs.existsSync(path.join(dir, 'manifest.json'))) {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    for (const [table, expected] of Object.entries(manifest.tables || {})) {
      const actual = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
      if (actual !== expected) {
        console.error(`COUNT MISMATCH ${table}: export=${expected} sqlite=${actual}`);
        ok = false;
      } else {
        console.log(`OK count ${table}: ${actual}`);
      }
    }
  }

  const billSum = db.prepare('SELECT SUM(total_paise) AS s FROM bills').get().s || 0;
  console.log(`Bill total sum (rupees): ${fromPaise(billSum)}`);

  const openKots = db.prepare(`SELECT COUNT(*) AS c FROM kots WHERE status = 'open'`).get().c;
  const occupied = db.prepare(`SELECT COUNT(*) AS c FROM restaurant_tables WHERE status = 'occupied'`).get().c;
  const activePagers = db.prepare(`SELECT COUNT(*) AS c FROM pager_assignments WHERE released_at IS NULL`).get().c;
  console.log(`Open KOTs: ${openKots}, occupied tables: ${occupied}, active pager assignments: ${activePagers}`);

  const users = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE deleted_at IS NULL`).get().c;
  const menu = db.prepare('SELECT COUNT(*) AS c FROM menu_items').get().c;
  console.log(`Active users: ${users}, menu items: ${menu}`);

  if (!ok) process.exit(1);
  console.log('Verification passed.');
}

main();
