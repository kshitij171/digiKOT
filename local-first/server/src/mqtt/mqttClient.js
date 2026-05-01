import mqtt from 'mqtt';

let client = null;
let lastError = null;
let lastPublishedAt = null;

export function getMqttState() {
  return {
    connected: Boolean(client?.connected),
    lastError,
    lastPublishedAt,
  };
}

export function connectMqtt({ url, username, password, onConnect, onError }) {
  if (client?.connected) return client;

  client = mqtt.connect(url, {
    username: username || undefined,
    password: password || undefined,
    reconnectPeriod: 2000,
  });

  client.on('connect', () => {
    lastError = null;
    onConnect?.();
  });

  client.on('error', (err) => {
    lastError = err?.message || String(err);
    onError?.(err);
  });

  client.on('close', () => {
    // keep lastError for status
  });

  return client;
}

export function publishJson(topic, payloadObj) {
  if (!client?.connected) {
    throw new Error('MQTT client not connected');
  }
  const payload = JSON.stringify(payloadObj);
  return new Promise((resolve, reject) => {
    client.publish(topic, payload, { qos: 1 }, (err) => {
      if (err) {
        lastError = err.message;
        reject(err);
        return;
      }
      lastPublishedAt = new Date().toISOString();
      resolve();
    });
  });
}
