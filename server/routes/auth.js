import { sqliteAdapter } from '../repositories/sqliteAdapter.js';
import {
  authPreHandler,
  getCookieName,
  sessionCookieOptions,
  signSession,
} from '../middleware/auth.js';
import {
  clearLoginAttempts,
  createLoginRateLimiter,
  recordLoginFailure,
} from '../middleware/loginRateLimit.js';
import { mapUserRow } from '../lib/money.js';

export async function authRoutes(fastify) {
  const rateLimit = createLoginRateLimiter({
    maxAttempts: fastify.config.loginMaxAttempts,
    lockoutMinutes: fastify.config.loginLockoutMinutes,
  });

  fastify.post('/auth/login', async (request, reply) => {
    if (!rateLimit(request, reply)) return;

    const { pinHash } = request.body || {};
    if (!pinHash) {
      reply.code(400).send({ error: 'pinHash required' });
      return;
    }

    const user = sqliteAdapter.select('users', {
      filters: [
        { column: 'pin_hash', value: pinHash },
        { column: 'active', value: 1 },
        { column: 'deleted_at', operator: 'is', value: null },
      ],
      single: true,
    });

    if (!user) {
      recordLoginFailure(request, {
        maxAttempts: fastify.config.loginMaxAttempts,
        lockoutMinutes: fastify.config.loginLockoutMinutes,
      });
      reply.code(401).send({ error: 'Invalid PIN' });
      return;
    }

    clearLoginAttempts(request);

    const token = await signSession(
      { userId: user.id, role: user.role, username: user.username },
      { secret: fastify.config.sessionSecret, ttlHours: fastify.config.sessionTtlHours }
    );

    reply.setCookie(
      getCookieName(),
      token,
      sessionCookieOptions(fastify.config.nodeEnv, fastify.config.sessionTtlHours)
    );

    const { pin_hash: _p, ...safeUser } = mapUserRow(user);
    return { user: safeUser };
  });

  fastify.post('/auth/logout', async (request, reply) => {
    reply.clearCookie(getCookieName(), { path: '/' });
    return { ok: true };
  });

  fastify.get('/auth/me', { preHandler: authPreHandler }, async (request) => {
    const user = sqliteAdapter.select('users', {
      filters: [{ column: 'id', value: request.user.userId }],
      single: true,
    });
    if (!user) return { user: null };
    const { pin_hash: _p, ...safeUser } = mapUserRow(user);
    return { user: safeUser };
  });
}
