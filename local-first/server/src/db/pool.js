import pg from 'pg';

/** @type {pg.Pool | null} */
let pool = null;

export function getPool(connectionString) {
  if (!pool) {
    pool = new pg.Pool({ connectionString, max: 10 });
  }
  return pool;
}

export async function dbHealth(connectionString) {
  const p = getPool(connectionString);
  const r = await p.query('select 1 as ok');
  return r.rows[0]?.ok === 1;
}
