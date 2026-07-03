import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.resolve(__dirname, '../../data/digikot.db');
const BUSY_TIMEOUT_MS = 5000;

let dbInstance = null;

export function getDbPath() {
  return process.env.DATABASE_PATH || DEFAULT_DB_PATH;
}

export function openDatabase(dbPath = getDbPath()) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
  return db;
}

export function getDb() {
  if (!dbInstance) {
    dbInstance = openDatabase();
  }
  return dbInstance;
}

export function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Run fn inside a transaction. Use for billing, KOT, table open/close, cancel approval.
 * @template T
 * @param {(db: import('better-sqlite3').Database) => T} fn
 * @returns {T}
 */
export function withTransaction(fn) {
  const db = getDb();
  const run = db.transaction(fn);
  return run(db);
}

export function nowIso() {
  return new Date().toISOString();
}
