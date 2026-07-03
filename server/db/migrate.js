import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeDb, getDb, getDbPath, openDatabase } from './sqlite.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function ensureMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function appliedVersions(db) {
  ensureMigrationsTable(db);
  return new Set(
    db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map((r) => r.version)
  );
}

export function migrate(dbPath = getDbPath()) {
  const db = openDatabase(dbPath);
  const applied = appliedVersions(db);

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    const version = parseInt(file.split('_')[0], 10);
    if (Number.isNaN(version) || applied.has(version)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    db.exec(sql);
    db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version);
    console.log(`Applied migration ${file}`);
    count += 1;
  }

  if (count === 0) console.log('No pending migrations.');
  db.close();
  return count;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    migrate();
    closeDb();
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
