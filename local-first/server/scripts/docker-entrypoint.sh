#!/bin/sh
set -e

if [ "${RUN_MIGRATIONS_ON_START:-1}" = "1" ]; then
  echo "Running database migrations..."
  node --import dotenv/config ./node_modules/node-pg-migrate/bin/node-pg-migrate.js up -m /db/migrations
fi

exec node src/app.js
