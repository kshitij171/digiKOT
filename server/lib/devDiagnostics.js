import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAppVersion } from './appVersion.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const DEV_LOGS_DIR = path.join(repoRoot, 'dev-logs');

const SCHEMA_VERSION = 1;
const MAX_LINE_BYTES = 8 * 1024;
const MAX_MESSAGE_LEN = 500;
const MAX_STACK_LEN = 2000;
const MAX_STRING_LEN = 1000;
const MAX_FILE_BYTES = 50 * 1024 * 1024;

const SENSITIVE_KEY = /pin|password|token|cookie|authorization|secret|whatsapp|ssid|hash/i;

let initialized = false;
let dropCount = 0;
let appVersion = readAppVersion();
let filePartIndex = 0;

export function isDevDiagnosticsEnabled() {
  return process.env.DEV_DIAGNOSTICS === '1' && process.env.NODE_ENV !== 'production';
}

function retentionDays() {
  const n = Number(process.env.DEV_LOG_RETENTION_DAYS || 14);
  return Number.isFinite(n) && n > 0 ? n : 14;
}

function pruneOldLogs() {
  if (!fs.existsSync(DEV_LOGS_DIR)) return;
  const cutoff = Date.now() - retentionDays() * 24 * 60 * 60 * 1000;
  for (const name of fs.readdirSync(DEV_LOGS_DIR)) {
    if (!name.startsWith('diagnostics-') || !name.endsWith('.jsonl')) continue;
    const full = path.join(DEV_LOGS_DIR, name);
    try {
      const st = fs.statSync(full);
      if (st.mtimeMs < cutoff) fs.unlinkSync(full);
    } catch {
      // ignore
    }
  }
}

function logFilePath() {
  const day = new Date().toISOString().slice(0, 10);
  const base = path.join(DEV_LOGS_DIR, `diagnostics-${day}`);
  const primary = `${base}.jsonl`;
  try {
    if (fs.existsSync(primary) && fs.statSync(primary).size >= MAX_FILE_BYTES) {
      filePartIndex += 1;
      return `${base}.${filePartIndex}.jsonl`;
    }
  } catch {
    // ignore
  }
  return primary;
}

export function initDevDiagnostics() {
  if (!isDevDiagnosticsEnabled() || initialized) return;
  initialized = true;
  appVersion = readAppVersion();
  fs.mkdirSync(DEV_LOGS_DIR, { recursive: true });
  pruneOldLogs();
}

function truncateStr(s, max) {
  if (typeof s !== 'string') return s;
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function maskPhone(value) {
  if (typeof value !== 'string') return '[redacted]';
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 4) return '****';
  return `****${digits.slice(-4)}`;
}

function redactValue(key, value) {
  if (value == null) return value;
  const k = String(key).toLowerCase();
  if (SENSITIVE_KEY.test(k)) return '[redacted]';
  if (k.includes('phone') || k === 'to' || k === 'customerphone') return maskPhone(String(value));
  if (typeof value === 'string') return truncateStr(value, MAX_STRING_LEN);
  if (Array.isArray(value)) return value.map((v, i) => redactValue(String(i), v));
  if (typeof value === 'object') return redactObject(value);
  return value;
}

function redactObject(obj, depth = 0) {
  if (obj == null || depth > 6) return obj;
  if (Array.isArray(obj)) return obj.map((v, i) => redactValue(String(i), v));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEY.test(k)) {
      out[k] = '[redacted]';
      continue;
    }
    if (typeof v === 'object' && v !== null) out[k] = redactObject(v, depth + 1);
    else out[k] = redactValue(k, v);
  }
  return out;
}

function normalizeEntry(raw) {
  const entry = redactObject({
    schemaVersion: SCHEMA_VERSION,
    appVersion,
    ts: raw.ts || new Date().toISOString(),
    layer: raw.layer || 'server',
    event: raw.event || 'unknown',
    traceId: raw.traceId || null,
    sessionId: raw.sessionId || null,
    requestId: raw.requestId || null,
    userId: raw.userId || null,
    role: raw.role || null,
    message: raw.message != null ? truncateStr(String(raw.message), MAX_MESSAGE_LEN) : undefined,
    stack: raw.stack != null ? truncateStr(String(raw.stack), MAX_STACK_LEN) : undefined,
    meta: raw.meta && typeof raw.meta === 'object' ? raw.meta : undefined,
  });
  if (entry.message === undefined) delete entry.message;
  if (entry.stack === undefined) delete entry.stack;
  if (!entry.meta) delete entry.meta;
  return entry;
}

export function appendDevLog(raw) {
  if (!isDevDiagnosticsEnabled()) return false;
  if (!initialized) initDevDiagnostics();

  const entry = normalizeEntry(raw);
  const line = `${JSON.stringify(entry)}\n`;
  if (Buffer.byteLength(line, 'utf8') > MAX_LINE_BYTES) {
    dropCount += 1;
    return false;
  }

  try {
    fs.appendFileSync(logFilePath(), line, 'utf8');
    return true;
  } catch {
    return false;
  }
}

export function getDevLogsDir() {
  return DEV_LOGS_DIR;
}
