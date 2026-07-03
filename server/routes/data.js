import { sqliteAdapter } from '../repositories/sqliteAdapter.js';
import { complexQueries } from '../services/complexQueries.js';
import { authPreHandler } from '../middleware/auth.js';
import {
  assertDeleteAccess,
  assertInsertAccess,
  assertQueryAccess,
  assertSelectAccess,
  assertUpdateAccess,
  domainEventForTable,
} from '../middleware/dataAccess.js';
import { emitDomainEvent } from '../realtime/socketHub.js';

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

function emitForTable(table) {
  const event = domainEventForTable(table);
  if (event) emitDomainEvent(event, { table, t: Date.now() });
}

export async function dataRoutes(fastify) {
  fastify.post('/data/select', { preHandler: authPreHandler }, async (request, reply) => {
    const { table, options } = request.body || {};
    if (!assertSelectAccess(request, reply, table)) return;
    return sqliteAdapter.select(table, options || {});
  });

  fastify.post('/data/insert', { preHandler: authPreHandler }, async (request, reply) => {
    const { table, payload } = request.body || {};
    if (!assertInsertAccess(request, reply, table)) return;
    const result = await sqliteAdapter.insert(table, payload);
    emitForTable(table);
    return result;
  });

  fastify.post('/data/update', { preHandler: authPreHandler }, async (request, reply) => {
    const { table, payload, filters } = request.body || {};
    if (!assertUpdateAccess(request, reply, table, payload)) return;
    const result = await sqliteAdapter.update(table, payload, filters || []);
    emitForTable(table);
    return result;
  });

  fastify.post('/data/delete', { preHandler: authPreHandler }, async (request, reply) => {
    const { table, filters } = request.body || {};
    if (!assertDeleteAccess(request, reply, table)) return;
    const result = await sqliteAdapter.delete(table, filters || []);
    emitForTable(table);
    return result;
  });

  fastify.post('/query', { preHandler: authPreHandler }, async (request, reply) => {
    const { name, body } = request.body || {};
    if (!assertQueryAccess(request, reply, name)) return;
    const handler = QUERY_HANDLERS[name];
    return handler(body || {});
  });
}
