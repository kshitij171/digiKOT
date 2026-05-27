import { loadEnv } from 'vite';

function applyRootEnv(mode, root) {
  const env = loadEnv(mode, root, '');
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function whatsappMiddleware(server) {
  applyRootEnv(server.config.mode, server.config.root);

  return async (req, res, next) => {
    const url = req.url?.split('?')[0];
    if (url !== '/api/whatsapp/send-bill') return next();
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    try {
      const body = await readJsonBody(req);
      const { sendBillWhatsAppFromPayload } = await import('./sendBillWhatsAppHandler.js');
      const result = await sendBillWhatsAppFromPayload(body);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, filename: result.filename }));
    } catch (err) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message || 'Failed to send bill on WhatsApp' }));
    }
  };
}

/** Vite plugin: POST /api/whatsapp/send-bill (dev + preview). */
export function whatsappApiPlugin() {
  return {
    name: 'whatsapp-api',
    configureServer(server) {
      server.middlewares.use(whatsappMiddleware(server));
    },
    configurePreviewServer(server) {
      server.middlewares.use(whatsappMiddleware(server));
    },
  };
}
