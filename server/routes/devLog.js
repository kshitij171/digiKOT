import { appendDevLog, isDevDiagnosticsEnabled } from '../lib/devDiagnostics.js';
import { authPreHandler } from '../middleware/auth.js';
import { checkDevLogRateLimit } from '../middleware/devLogRateLimit.js';

const MAX_EVENTS = 50;

const ALLOWED_EVENTS = new Set([
  'ui.action.start',
  'ui.action.end',
  'ui.action.error',
  'ui.route',
  'api.ok',
  'api.error',
  'client.error',
  'realtime.event',
  'client.forward',
]);

function sanitizeClientEvent(raw, request) {
  const event = typeof raw.event === 'string' ? raw.event : 'client.forward';
  return {
    layer: 'client',
    event: ALLOWED_EVENTS.has(event) ? event : 'client.forward',
    traceId: raw.traceId || null,
    sessionId: raw.sessionId || request.headers['x-session-id'] || null,
    requestId: raw.requestId || null,
    userId: raw.userId || request.user?.userId || null,
    role: raw.role || request.user?.role || null,
    message: raw.message,
    stack: raw.stack,
    meta: raw.meta && typeof raw.meta === 'object' ? raw.meta : undefined,
    ts: raw.ts,
  };
}

export async function devLogRoutes(fastify) {
  if (!isDevDiagnosticsEnabled()) return;

  fastify.post(
    '/dev/log',
    {
      config: { rawBody: false },
      bodyLimit: 64 * 1024,
      preHandler: [checkDevLogRateLimit, authPreHandler],
    },
    async (request, reply) => {
      const events = request.body;
      if (!Array.isArray(events)) {
        reply.code(400).send({ error: 'Expected array of events' });
        return;
      }
      if (events.length > MAX_EVENTS) {
        reply.code(400).send({ error: `Max ${MAX_EVENTS} events per batch` });
        return;
      }

      let accepted = 0;
      for (const raw of events) {
        if (!raw || typeof raw !== 'object') continue;
        if (appendDevLog(sanitizeClientEvent(raw, request))) accepted += 1;
      }

      reply.send({ ok: true, accepted });
    },
  );
}
