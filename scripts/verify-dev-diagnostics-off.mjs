#!/usr/bin/env node
/**
 * Production-safety check: dev diagnostics must be off when DEV_DIAGNOSTICS is unset.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const devLogsDir = path.join(repoRoot, 'dev-logs');
const testPort = 3099;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(port, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return true;
    } catch {
      // retry
    }
    await sleep(250);
  }
  return false;
}

async function main() {
  if (fs.existsSync(devLogsDir)) {
    fs.rmSync(devLogsDir, { recursive: true, force: true });
  }

  const env = {
    ...process.env,
    PORT: String(testPort),
    NODE_ENV: 'development',
  };
  delete env.DEV_DIAGNOSTICS;

  const child = spawn('node', ['server/app.js'], {
    cwd: repoRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let failed = false;
  const fail = (msg) => {
    failed = true;
    console.error(`FAIL: ${msg}`);
  };

  try {
    const ready = await waitForHealth(testPort);
    if (!ready) {
      fail('server did not become healthy');
      return;
    }

    const res = await fetch(`http://127.0.0.1:${testPort}/api/dev/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ event: 'test', layer: 'client' }]),
    });

    if (res.status !== 404) {
      fail(`POST /api/dev/log expected 404, got ${res.status}`);
    }

    if (fs.existsSync(devLogsDir)) {
      fail('dev-logs/ was created while DEV_DIAGNOSTICS is unset');
    }

    if (!failed) {
      console.log('OK: dev diagnostics off — route 404, no dev-logs/');
    }
  } finally {
    child.kill('SIGTERM');
    await sleep(300);
    if (!child.killed) child.kill('SIGKILL');
  }

  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
