import { authPreHandler, requireRoles } from '../middleware/auth.js';
import { sendBillWhatsAppFromPayload } from '../sendBillWhatsAppHandler.js';

/** Waiter sends bills; manager may also send. */
const billSendRoles = requireRoles('waiter', 'manager', 'owner');

export async function whatsappRoutes(fastify) {
  fastify.post(
    '/whatsapp/send-bill',
    { preHandler: [authPreHandler, billSendRoles] },
    async (request, reply) => {
      try {
        const result = await sendBillWhatsAppFromPayload(request.body || {});
        return { ok: true, filename: result.filename };
      } catch (err) {
        reply.code(400).send({ error: err.message || 'Failed to send bill on WhatsApp' });
      }
    }
  );
}
