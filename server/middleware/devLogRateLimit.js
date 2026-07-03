/** In-memory rate limit for POST /api/dev/log — 120 req/min per IP. */

const buckets = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 120;

function clientKey(request) {
  return request.ip || request.headers['x-forwarded-for'] || 'unknown';
}

export async function checkDevLogRateLimit(request, reply) {
  const key = clientKey(request);
  const now = Date.now();
  let entry = buckets.get(key);
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    entry = { windowStart: now, count: 0 };
    buckets.set(key, entry);
  }
  entry.count += 1;
  if (entry.count > MAX_PER_WINDOW) {
    return reply.code(429).send({ error: 'Dev log rate limit exceeded' });
  }
}
