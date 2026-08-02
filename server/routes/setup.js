import { getSetupStore } from '../setup/setupStore.js';
import { requireSetupToken } from '../setup/setupAuth.js';
import {
  setupAck,
  setupAuth,
  setupCommand,
  setupForget,
  setupHello,
  setupListDevices,
  setupPatchDevice,
  setupPushAll,
  setupPushOne,
  setupSaveRestaurantWifi,
  setupTest,
} from '../setup/setupHandlers.js';

function guardSetup(request, reply) {
  const auth = requireSetupToken(getSetupStore(), request);
  if (!auth.ok) {
    reply.code(auth.status).send({ error: auth.error });
    return false;
  }
  return true;
}

export async function setupRoutes(fastify) {
  fastify.post('/setup/auth', async (request, reply) => {
    const result = await setupAuth(request.body || {});
    return reply.code(result.status).send(result.body);
  });

  fastify.post('/setup/hello', async (request, reply) => {
    const result = await setupHello(request.body || {});
    return reply.code(result.status).send(result.body);
  });

  fastify.get('/setup/command', async (request, reply) => {
    const mac = request.query.mac;
    const result = await setupCommand(mac);
    return reply.code(result.status).send(result.body);
  });

  fastify.post('/setup/ack', async (request, reply) => {
    const result = await setupAck(request.body || {});
    return reply.code(result.status).send(result.body);
  });

  fastify.get('/setup/devices', async (request, reply) => {
    if (!guardSetup(request, reply)) return;
    const result = await setupListDevices();
    return reply.code(result.status).send(result.body);
  });

  fastify.patch('/setup/devices/:mac', async (request, reply) => {
    if (!guardSetup(request, reply)) return;
    const mac = decodeURIComponent(request.params.mac);
    const result = await setupPatchDevice(mac, request.body || {});
    return reply.code(result.status).send(result.body);
  });

  fastify.post('/setup/restaurant-wifi', async (request, reply) => {
    if (!guardSetup(request, reply)) return;
    const result = await setupSaveRestaurantWifi(request.body || {});
    return reply.code(result.status).send(result.body);
  });

  fastify.post('/setup/push-all', async (request, reply) => {
    if (!guardSetup(request, reply)) return;
    const result = await setupPushAll();
    return reply.code(result.status).send(result.body);
  });

  fastify.post('/setup/push/:mac', async (request, reply) => {
    if (!guardSetup(request, reply)) return;
    const mac = decodeURIComponent(request.params.mac);
    const result = await setupPushOne(mac);
    return reply.code(result.status).send(result.body);
  });

  fastify.post('/setup/forget/:mac', async (request, reply) => {
    if (!guardSetup(request, reply)) return;
    const mac = decodeURIComponent(request.params.mac);
    const result = await setupForget(mac);
    return reply.code(result.status).send(result.body);
  });

  fastify.post('/setup/test/:mac', async (request, reply) => {
    if (!guardSetup(request, reply)) return;
    const mac = decodeURIComponent(request.params.mac);
    const result = await setupTest(mac);
    return reply.code(result.status).send(result.body);
  });
}
