'use strict';

exports.shorthands = undefined;

/**
 * Adds users.username for installs that ran init before that column existed.
 * Fresh installs get username from init.up.sql; this migration is a no-op then.
 */
exports.up = (pgm) => {
  pgm.sql(`
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'username'
  ) THEN
    ALTER TABLE users ADD COLUMN username text;
    UPDATE users SET username = id WHERE username IS NULL;
    ALTER TABLE users ALTER COLUMN username SET NOT NULL;
    CREATE UNIQUE INDEX idx_users_username ON users (username);
  END IF;
END
$migration$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_users_username;
    ALTER TABLE users DROP COLUMN IF EXISTS username;
  `);
};
