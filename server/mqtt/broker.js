import aedes from 'aedes';
import { createServer } from 'node:net';

/** @type {import('aedes').Aedes | null} */
let broker = null;
/** @type {import('node:net').Server | null} */
let netServer = null;

export async function startMqttBroker(port, host = '0.0.0.0', { retries = 8, retryMs = 400 } = {}) {
  if (broker) return broker;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      broker = aedes();
      netServer = createServer(broker.handle);
      await new Promise((resolve, reject) => {
        const onError = (err) => {
          netServer?.off('error', onError);
          reject(err);
        };
        netServer.once('error', onError);
        netServer.listen(port, host, () => {
          netServer.off('error', onError);
          console.log(`MQTT broker listening on ${host}:${port}`);
          resolve();
        });
      });
      return broker;
    } catch (err) {
      broker = null;
      netServer = null;
      if (err?.code === 'EADDRINUSE' && attempt < retries) {
        await new Promise((r) => setTimeout(r, retryMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`MQTT broker failed to bind ${host}:${port}`);
}

export function getMqttBroker() {
  return broker;
}

export async function stopMqttBroker() {
  const server = netServer;
  const activeBroker = broker;
  netServer = null;
  broker = null;

  if (!server) return;

  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const timer = setTimeout(() => {
      try {
        server.close();
      } catch {
        // ignore
      }
      try {
        activeBroker?.close();
      } catch {
        // ignore
      }
      finish();
    }, 1500);
    timer.unref?.();

    server.close(() => {
      clearTimeout(timer);
      if (activeBroker) {
        activeBroker.close(finish);
      } else {
        finish();
      }
    });
  });
}

export function publishJson(topic, payloadObj) {
  if (!broker) throw new Error('MQTT broker not started');
  const payload = JSON.stringify(payloadObj);
  return new Promise((resolve, reject) => {
    broker.publish({ topic, payload, qos: 0 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function subscribeTopic(pattern, handler) {
  if (!broker) throw new Error('MQTT broker not started');
  broker.on('publish', (packet, client) => {
    if (!client) return;
    if (!topicMatch(pattern, packet.topic)) return;
    handler(packet.topic, packet.payload);
  });
}

function topicMatch(pattern, topic) {
  const pParts = pattern.split('/');
  const tParts = topic.split('/');
  for (let i = 0; i < pParts.length; i++) {
    if (pParts[i] === '#') return true;
    if (pParts[i] === '+') continue;
    if (pParts[i] !== tParts[i]) return false;
  }
  return pParts.length === tParts.length;
}
