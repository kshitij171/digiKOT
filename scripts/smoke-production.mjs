#!/usr/bin/env node
/**
 * Production smoke check — health endpoint only (no auth / demo PINs).
 * Usage: node scripts/smoke-production.mjs [baseUrl]
 */
const base = process.argv[2] || process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000';

async function main() {
  const url = `${base.replace(/\/$/, '')}/api/health`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`FAIL health ${res.status}`);
    process.exit(1);
  }
  const body = await res.json();
  if (!body.ok || !body.db) {
    console.error('FAIL health body', body);
    process.exit(1);
  }
  console.log('OK', JSON.stringify(body));
}

main().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
