import { SignJWT, jwtVerify } from 'jose';

const COOKIE_NAME = 'digikot_session';

function secretKey(secret) {
  return new TextEncoder().encode(secret);
}

export async function signSession(payload, { secret, ttlHours }) {
  const exp = Math.floor(Date.now() / 1000) + ttlHours * 3600;
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(secretKey(secret));
}

export async function verifySession(token, secret) {
  const { payload } = await jwtVerify(token, secretKey(secret));
  return payload;
}

export function getCookieName() {
  return COOKIE_NAME;
}

export function sessionCookieOptions(nodeEnv, ttlHours) {
  // Restaurant / LAN deploys use http://<lan-ip>:3000 — Secure cookies are rejected on HTTP.
  // Only set Secure when explicitly enabled (HTTPS terminators).
  const secure =
    process.env.COOKIE_SECURE === '1' ||
    process.env.COOKIE_SECURE === 'true';
  return {
    httpOnly: true,
    // Lax works for same-site LAN (page and /api on same host:port).
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: ttlHours * 3600,
  };
}

/** Cookie session, or Authorization: Bearer <jwt> (LAN / proxy-friendly). */
export function readSessionToken(request) {
  const fromCookie = request.cookies?.[COOKIE_NAME];
  if (fromCookie) return fromCookie;
  const header = request.headers?.authorization || request.headers?.Authorization;
  if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  return null;
}

export async function authPreHandler(request, reply) {
  const secret = request.server.config.sessionSecret;
  const token = readSessionToken(request);
  if (!token) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
  try {
    request.user = await verifySession(token, secret);
  } catch {
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return reply.code(401).send({ error: 'Session expired' });
  }
}

export function requireRoles(...roles) {
  return async function roleGuard(request, reply) {
    if (!request.user) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }
    if (!roles.includes(request.user.role)) {
      reply.code(403).send({ error: 'Forbidden' });
      return;
    }
  };
}
