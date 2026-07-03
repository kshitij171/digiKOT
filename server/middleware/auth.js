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
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: nodeEnv === 'production',
    path: '/',
    maxAge: ttlHours * 3600,
  };
}

export async function authPreHandler(request, reply) {
  const secret = request.server.config.sessionSecret;
  const token = request.cookies?.[COOKIE_NAME];
  if (!token) {
    reply.code(401).send({ error: 'Unauthorized' });
    return;
  }
  try {
    request.user = await verifySession(token, secret);
  } catch {
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    reply.code(401).send({ error: 'Session expired' });
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
