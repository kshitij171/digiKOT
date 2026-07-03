#!/usr/bin/env node
/**
 * Export Postgres data to JSON for SQLite import.
 *
 * Modes:
 *   --mode=production  BACKUP FIRST via pg_dump, then export (never resets DB)
 *   --mode=dev-seed    Export from local Supabase after seed (dev only)
 *
 * Requires: Supabase running OR DATABASE_URL to Postgres.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const TABLES = [
  'users', 'waiter_sessions', 'restaurant_tables', 'table_sessions', 'categories',
  'menu_items', 'kots', 'kot_items', 'kot_actions', 'cancel_requests', 'bills',
  'bill_items', 'bill_modification_requests', 'notifications', 'audit_logs',
  'postprep_adjustments', 'pager_devices', 'pager_assignments',
];

const mode = process.argv.includes('--mode=production') ? 'production' : 'dev-seed';
const outDir = path.resolve('server/db/fixtures/export');
const pgUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

function runPsql(sql) {
  const r = spawnSync('psql', [pgUrl, '-t', '-A', '-c', sql], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || 'psql failed');
  return r.stdout;
}

function main() {
  fs.mkdirSync(outDir, { recursive: true });

  if (mode === 'production') {
    const backup = path.join(outDir, `backup-${Date.now()}.sql`);
    console.log(`Production mode: creating backup ${backup}`);
    const dump = spawnSync('pg_dump', [pgUrl, '-f', backup], { stdio: 'inherit' });
    if (dump.status !== 0) {
      console.error('pg_dump failed. Fix connection or set DATABASE_URL.');
      process.exit(1);
    }
    console.log('Backup OK. Exporting tables...');
  } else {
    console.warn('dev-seed mode: export current Postgres state (do not run db reset before export of real data).');
  }

  const manifest = { mode, exportedAt: new Date().toISOString(), tables: {} };

  for (const table of TABLES) {
    const raw = runPsql(`SELECT json_agg(t) FROM (SELECT * FROM ${table}) t`);
    const parsed = raw.trim() === '' || raw.trim() === 'null' ? [] : JSON.parse(raw);
    const file = path.join(outDir, `${table}.json`);
    fs.writeFileSync(file, JSON.stringify(parsed, null, 2));
    manifest.tables[table] = parsed.length;
    console.log(`  ${table}: ${parsed.length} rows`);
  }

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`Export complete → ${outDir}`);
}

main();
