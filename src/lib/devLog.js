const ENABLED = import.meta.env.DEV && import.meta.env.VITE_DEV_DIAGNOSTICS === '1';

const SESSION_KEY = 'digikot_dev_session';
const FLUSH_MS = 500;
const MAX_MESSAGE_LEN = 500;
const MAX_STACK_LEN = 2000;
const MAX_STRING_LEN = 1000;
const SENSITIVE_KEY = /pin|password|token|cookie|authorization|secret|whatsapp|ssid|hash/i;

const queue = [];
const traceStack = [];
let flushTimer = null;
let sessionId = null;

export function isDevLogEnabled() {
  return ENABLED;
}

function getOrCreateSessionId() {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

export function initDevLogSession() {
  if (!ENABLED) return;
  sessionId = getOrCreateSessionId();
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
  if (k.includes('phone') || k === 'to') return maskPhone(String(value));
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

function normalizeEvent(event, extra = {}) {
  const raw = {
    ts: new Date().toISOString(),
    event,
    traceId: extra.traceId ?? peekTraceId(),
    sessionId: extra.sessionId ?? sessionId,
    requestId: extra.requestId ?? null,
    userId: extra.userId ?? null,
    role: extra.role ?? null,
    message: extra.message != null ? truncateStr(String(extra.message), MAX_MESSAGE_LEN) : undefined,
    stack: extra.stack != null ? truncateStr(String(extra.stack), MAX_STACK_LEN) : undefined,
    meta: extra.meta && typeof extra.meta === 'object' ? redactObject(extra.meta) : undefined,
  };
  if (raw.message === undefined) delete raw.message;
  if (raw.stack === undefined) delete raw.stack;
  if (!raw.meta) delete raw.meta;
  return raw;
}

async function flushQueue() {
  flushTimer = null;
  if (!ENABLED || queue.length === 0) return;
  const batch = queue.splice(0, 50);
  try {
    await fetch('/api/dev/log', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId || '' },
      body: JSON.stringify(batch),
    });
  } catch {
    // dev-only; ignore transport errors
  }
}

function scheduleFlush(immediate = false) {
  if (!ENABLED) return;
  if (immediate) {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = null;
    flushQueue();
    return;
  }
  if (flushTimer) return;
  flushTimer = setTimeout(flushQueue, FLUSH_MS);
}

export function devLog(event, extra = {}) {
  if (!ENABLED) return;
  if (!sessionId) initDevLogSession();
  queue.push(normalizeEvent(event, extra));
  const urgent = event === 'api.error' || event === 'ui.action.error' || event === 'client.error';
  scheduleFlush(urgent);
}

export function pushTraceId(traceId) {
  if (traceId) traceStack.push(traceId);
}

export function popTraceId() {
  traceStack.pop();
}

export function peekTraceId() {
  return traceStack.length ? traceStack[traceStack.length - 1] : null;
}

export async function withTraceId(traceId, fn) {
  pushTraceId(traceId);
  try {
    return await fn();
  } finally {
    popTraceId();
  }
}

export function startTrace(action, meta = {}) {
  const trace = {
    traceId: crypto.randomUUID(),
    action,
    startedAt: Date.now(),
    meta: meta && typeof meta === 'object' ? meta : {},
  };
  logWithTrace(trace, 'ui.action.start', { meta: trace.meta });
  return trace;
}

export function logWithTrace(trace, event, extra = {}) {
  devLog(event, { traceId: trace?.traceId, ...extra });
}

export function endTrace(trace, status, err) {
  if (!trace || !ENABLED) return;
  if (status === 'error' && err) {
    logWithTrace(trace, 'ui.action.error', {
      message: err?.message || String(err),
      stack: err?.stack,
      meta: { action: trace.action, status },
    });
    return;
  }
  logWithTrace(trace, 'ui.action.end', {
    meta: { action: trace.action, status, ms: Date.now() - trace.startedAt },
  });
}
