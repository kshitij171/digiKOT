/** In-memory login rate limiting per client IP. */

const attempts = new Map();

function clientKey(request) {
  return request.ip || request.headers['x-forwarded-for'] || 'unknown';
}

export function createLoginRateLimiter({ maxAttempts, lockoutMinutes }) {
  const lockoutMs = lockoutMinutes * 60 * 1000;

  return function checkLoginRateLimit(request, reply) {
    const key = clientKey(request);
    const now = Date.now();
    let entry = attempts.get(key);
    if (!entry) {
      entry = { count: 0, lockedUntil: 0 };
      attempts.set(key, entry);
    }

    if (entry.lockedUntil > now) {
      const retrySec = Math.ceil((entry.lockedUntil - now) / 1000);
      reply.code(429).send({
        error: 'Too many login attempts',
        retryAfterSeconds: retrySec,
      });
      return false;
    }

    return true;
  };
}

export function recordLoginFailure(request, { maxAttempts, lockoutMinutes }) {
  const key = clientKey(request);
  const now = Date.now();
  let entry = attempts.get(key);
  if (!entry) entry = { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= maxAttempts) {
    entry.lockedUntil = now + lockoutMinutes * 60 * 1000;
    entry.count = 0;
  }
  attempts.set(key, entry);
}

export function clearLoginAttempts(request) {
  attempts.delete(clientKey(request));
}
