import { randomUUID } from 'node:crypto';
import { appendDevLog, isDevDiagnosticsEnabled } from '../lib/devDiagnostics.js';

export function registerDevDiagnosticsHooks(fastify) {
  if (!isDevDiagnosticsEnabled()) return;

  fastify.addHook('onRequest', async (request) => {
    request.requestId = request.headers['x-request-id'] || randomUUID();
    request.traceId = request.headers['x-trace-id'] || null;
    request._devStartMs = Date.now();
  });

  fastify.addHook('onResponse', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    if (request.url === '/api/dev/log') return;

    const ms = Date.now() - (request._devStartMs || Date.now());
    const status = reply.statusCode;
    const base = {
      layer: 'server',
      event: status >= 400 ? 'api.error' : 'api.request',
      traceId: request.traceId,
      sessionId: request.headers['x-session-id'] || null,
      requestId: request.requestId,
      userId: request.user?.userId || null,
      role: request.user?.role || null,
      meta: {
        method: request.method,
        path: request.url.split('?')[0],
        status,
        ms,
      },
    };

    if (status >= 400 && request._devErrorMessage) {
      base.message = request._devErrorMessage;
    }

    appendDevLog(base);

    if (request.url.startsWith('/api/auth/login') && status === 401) {
      appendDevLog({
        layer: 'server',
        event: 'auth.fail',
        requestId: request.requestId,
        meta: { path: '/api/auth/login', reason: 'invalid_pin' },
      });
    }
  });

  fastify.addHook('onError', async (request, reply, error) => {
    if (!request.url?.startsWith('/api/')) return;
    request._devErrorMessage = error.message;
    appendDevLog({
      layer: 'server',
      event: 'api.error',
      traceId: request.traceId,
      requestId: request.requestId,
      userId: request.user?.userId || null,
      role: request.user?.role || null,
      message: error.message,
      stack: error.stack,
      meta: {
        method: request.method,
        path: request.url?.split('?')[0],
        status: reply.statusCode || 500,
      },
    });
  });
}
