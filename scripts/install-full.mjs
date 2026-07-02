#!/usr/bin/env node
/**
 * Full pager install stack: Mosquitto + Supabase + pager-bridge + Vite (LAN).
 * Requires .env.local with SUPABASE_SERVICE_ROLE_KEY, SETUP_UI_PASSWORD, MQTT_URL.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const UI_PORT = 5173;
const MOSQUITTO_NAME = 'digikot-mosquitto';
const ENV_FILE = join(repoRoot, '.env.local');

const children = [];

function isPrivateIpv4(addr) {
  if (addr.startsWith('10.')) return true;
  if (addr.startsWith('192.168.')) return true;
  const m = /^172\.(\d+)\./.exec(addr);
  if (m) {
    const n = Number(m[1]);
    return n >= 16 && n <= 31;
  }
  return false;
}

function getLanIp() {
  const nets = networkInterfaces();
  const prefer = ['en0', 'en1', 'wlan0', 'eth0', 'Wi-Fi', 'Ethernet'];
  const tryIface = (name) => {
    const addrs = nets[name];
    if (!addrs) return null;
    for (const a of addrs) {
      const v4 = a.family === 'IPv4' || a.family === 4;
      if (v4 && !a.internal && isPrivateIpv4(a.address)) return a.address;
    }
    return null;
  };
  for (const name of prefer) {
    const ip = tryIface(name);
    if (ip) return ip;
  }
  for (const addrs of Object.values(nets)) {
    for (const a of addrs) {
      const v4 = a.family === 'IPv4' || a.family === 4;
      if (v4 && !a.internal && isPrivateIpv4(a.address)) return a.address;
    }
  }
  return null;
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...opts,
  });
  return r;
}

function ensureMosquitto() {
  const inspect = run('docker', ['inspect', '-f', '{{.State.Running}}', MOSQUITTO_NAME]);
  if (inspect.status === 0) {
    if (inspect.stdout?.trim() === 'true') {
      console.log('  Mosquitto:     running (digikot-mosquitto :1883)');
      return;
    }
    console.log('  Mosquitto:     starting existing container…');
    const start = run('docker', ['start', MOSQUITTO_NAME], { stdio: 'inherit' });
    if (start.status !== 0) {
      console.error('Failed to start Mosquitto container.');
      process.exit(1);
    }
    console.log('  Mosquitto:     started');
    return;
  }

  console.log('  Mosquitto:     creating container…');
  const create = run('docker', [
    'run', '-d', '--name', MOSQUITTO_NAME, '-p', '1883:1883', 'eclipse-mosquitto:2',
  ], { stdio: 'inherit' });
  if (create.status !== 0) {
    console.error('Failed to create Mosquitto. Is Docker running?');
    process.exit(1);
  }
  console.log('  Mosquitto:     created and started (:1883)');
}

function ensureSupabase() {
  console.log('  Supabase:      starting…');
  const r = run('npx', ['supabase', 'start'], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error('Supabase start failed.');
    process.exit(r.status ?? 1);
  }
  console.log('  Supabase:      running (:54321)');
}

function spawnPrefixed(name, command, args) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  children.push(child);

  const prefix = `[${name}] `;
  child.stdout?.on('data', (chunk) => {
    for (const line of String(chunk).split('\n')) {
      if (line.length) process.stdout.write(prefix + line + '\n');
    }
  });
  child.stderr?.on('data', (chunk) => {
    for (const line of String(chunk).split('\n')) {
      if (line.length) process.stderr.write(prefix + line + '\n');
    }
  });
  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`${prefix}exited with code ${code}`);
    }
  });
  return child;
}

function printBanner(lanIp) {
  const base = lanIp ? `http://${lanIp}:${UI_PORT}` : `http://localhost:${UI_PORT}`;
  const local = `http://localhost:${UI_PORT}`;
  console.log(`
  ┌─────────────────────────────────────────────────────────────┐
  │  digiKOT install:full — Mosquitto + Supabase + bridge + UI  │
  └─────────────────────────────────────────────────────────────┘

  Services:
    Mosquitto      mqtt://127.0.0.1:1883
    pager-bridge   polling notifications → MQTT
    Supabase API   http://127.0.0.1:54321
    UI (Vite)      ${local}
${lanIp && lanIp !== '127.0.0.1' ? `    LAN UI         ${base}` : ''}

  Pager install:  ${local}/setup  (SETUP_UI_PASSWORD in .env.local)
  Staff login:    ${local}/login  (waiter 1234/5678 · manager 4321)

  Ctrl+C stops pager-bridge and Vite (Mosquitto + Supabase keep running).
`);
}

function shutdown(signal) {
  console.log(`\n  Stopping (${signal})…`);
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(0), 500);
}

function main() {
  if (!existsSync(ENV_FILE)) {
    console.error('Missing .env.local — copy .env.example and set keys from: npm run supabase:status');
    process.exit(1);
  }

  console.log('\n  Starting full install stack…\n');
  ensureMosquitto();
  ensureSupabase();

  spawnPrefixed('pager-bridge', 'node', ['--env-file=.env.local', 'pager-bridge/src/index.js']);

  const lanIp = getLanIp();
  printBanner(lanIp);

  const vite = spawn('npx', ['vite', '--host', '0.0.0.0', '--port', String(UI_PORT)], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  children.push(vite);

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  vite.on('exit', (code) => {
    for (const child of children) {
      if (child !== vite && !child.killed) child.kill('SIGTERM');
    }
    process.exit(code ?? 0);
  });
}

main();
