import { sqliteAdapter } from '../repositories/sqliteAdapter.js';
import { complexQueries } from '../services/complexQueries.js';
import { authPreHandler } from '../middleware/auth.js';

const QUERY_HANDLERS = {
  'billing.listClearedBills': (b) => complexQueries.listClearedBills(b),
  'billing.getLatestDraftBillForTable': (b) => complexQueries.getLatestDraftBillForTable(b.tableNumber),
  'billing.getLatestClearedBillForTable': (b) => complexQueries.getLatestClearedBillForTable(b.tableNumber),
  'billing.listVoidBills': (b) => complexQueries.listVoidBills(b),
  'billing.listResettledBills': (b) => complexQueries.listResettledBills(b),
  'billing.listHighDiscountBills': (b) => complexQueries.listHighDiscountBills(b),
  'users.listUsers': () => complexQueries.listUsers(),
  'users.findByUsernameAdmin': (b) => complexQueries.findByUsernameAdmin(b.username),
  'users.updatePinByUserId': (b) => complexQueries.updatePinByUserId(b.userId, b.pinHash),
  'users.codeExists': (b) => complexQueries.codeExists(b.code),
  'users.listAllPinHashes': () => complexQueries.listAllPinHashes(),
  'kots.listClearedBySupervisor': (b) => complexQueries.listClearedBySupervisor(b.supervisorId, b),
  'kots.listCancelled': (b) => complexQueries.listCancelledKots(b),
  'kots.assignSupervisor': (b) => complexQueries.assignSupervisor(b.kotId, b.supervisorId, b.supervisorName),
  'billMod.listForManager': (b) => complexQueries.listBillModForManager(b.managerUserId, b.limit),
};

export async function dataRoutes(fastify) {
  fastify.post('/data/select', { preHandler: authPreHandler }, async (request) => {
    const { table, options } = request.body || {};
    return sqliteAdapter.select(table, options || {});
  });

  fastify.post('/data/insert', { preHandler: authPreHandler }, async (request) => {
    const { table, payload } = request.body || {};
    return sqliteAdapter.insert(table, payload);
  });

  fastify.post('/data/update', { preHandler: authPreHandler }, async (request) => {
    const { table, payload, filters } = request.body || {};
    return sqliteAdapter.update(table, payload, filters || []);
  });

  fastify.post('/data/delete', { preHandler: authPreHandler }, async (request) => {
    const { table, filters } = request.body || {};
    return sqliteAdapter.delete(table, filters || []);
  });

  fastify.post('/query', { preHandler: authPreHandler }, async (request, reply) => {
    const { name, body } = request.body || {};
    const handler = QUERY_HANDLERS[name];
    if (!handler) {
      reply.code(404).send({ error: `Unknown query: ${name}` });
      return;
    }
    return handler(body || {});
  });
}
