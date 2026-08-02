-- Allow owner role (same manager UI access; can create managers).
-- SQLite cannot ALTER CHECK constraints in place — rebuild users table.

PRAGMA foreign_keys = OFF;

CREATE TABLE users_new (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('waiter', 'kitchen_supervisor', 'manager', 'owner')),
  code TEXT NOT NULL UNIQUE,
  username TEXT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO users_new (
  id, role, code, username, name, phone, pin_hash, active, deleted_at, created_at, updated_at
)
SELECT
  id, role, code, username, name, phone, pin_hash, active, deleted_at, created_at, updated_at
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (username) WHERE username IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_pin_hash_active ON users (pin_hash) WHERE active = 1;
CREATE INDEX IF NOT EXISTS idx_users_role_active ON users (role, active);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users (deleted_at) WHERE deleted_at IS NOT NULL;

PRAGMA foreign_keys = ON;
