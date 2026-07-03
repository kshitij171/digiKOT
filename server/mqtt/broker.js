import aedes from 'aedes';
import { createServer } from 'node:net';

/** @type {import('aedes').Aedes | null} */
let broker = null;
/** @type {import('node:net').Server | null} */
let netServer = null;

export async function startMqttBroker(port, host = '0.0.0.0') {
  if (broker) return broker;

  broker = aedes();
  netServer = createServer(broker.handle);

  return new Promise((resolve, reject) => {
    netServer.listen(port, host, () => {
      console.log(`MQTT broker listening on ${host}:${port}`);
      resolve(broker);
    });
    netServer.on('error', reject);
  });
}

export function getMqttBroker() {
  return broker;
}

export async function stopMqttBroker() {
  return new Promise((resolve) => {
    if (!netServer) {
      resolve();
      return;
    }
    netServer.close(() => {
      broker?.close(() => {
        broker = null;
        netServer = null;
        resolve();
      });
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
