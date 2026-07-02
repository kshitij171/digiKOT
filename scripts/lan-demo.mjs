#!/usr/bin/env node
/**
 * LAN restaurant demo: print shareable URLs, then start Vite on 0.0.0.0.
 * Supabase API host is chosen automatically in the browser (resolveSupabaseUrl).
 */
import { spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const UI_PORT = 5173;
const DEMO_PATHS = [
  { label: 'Login (start here)', path: '/login', pin: null },
  { label: 'Waiter — tables', path: '/waiter', pin: '1234 / 5678' },
  { label: 'Kitchen', path: '/kitchen', pin: '9999' },
  { label: 'Manager', path: '/manager', pin: '4321' },
  { label: 'Install setup', path: '/setup', pin: 'SETUP_UI_PASSWORD' },
];

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

function printDemoBanner(ip) {
  const base = ip ? `http://${ip}:${UI_PORT}` : `http://<your-lan-ip>:${UI_PORT}`;
  const lines = [
    '',
    '  ┌─────────────────────────────────────────────────────────────┐',
    '  │  KOT LAN demo — same Wi-Fi, open on phones/tablets          │',
    '  └─────────────────────────────────────────────────────────────┘',
    '',
    `  UI (Vite):     ${base}`,
    ip ? `  Supabase API:  http://${ip}:54321  (auto-matched in browser)` : '  Supabase API:  http://<lan-ip>:54321',
    '',
    '  Share these links:',
    '',
  ];

  for (const { label, path, pin } of DEMO_PATHS) {
    const pinNote = pin ? `  PIN ${pin}` : '';
    lines.push(`    ${label.padEnd(22)} ${base}${path}${pinNote}`);
  }

  lines.push(
    '',
    '  Prerequisites: npm run supabase:start  (Docker kot-system running)',
    '  Demo PINs after seed: waiter 1234/5678 · kitchen 9999 · manager 4321',
    '  Pager install: /setup (installer password) — see docs/PAGER_INSTALL_RUNBOOK.md',
    '',
    '  If phones cannot connect: allow firewall TCP 5173 + 54321 on this laptop.',
    '',
  );

  console.log(lines.join('\n'));
}

const lanIp = getLanIp();
printDemoBanner(lanIp);

const vite = spawn('npx', ['vite', '--host', '0.0.0.0', '--port', String(UI_PORT)], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  cwd: repoRoot,
});

vite.on('exit', (code) => process.exit(code ?? 0));
