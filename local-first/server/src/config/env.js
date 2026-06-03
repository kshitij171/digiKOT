import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// __dirname = server/src/config → repo env lives at local-first/.env (three levels up)
dotenv.config({ path: path.join(__dirname, '../../../.env') });
dotenv.config({ path: path.join(__dirname, '../../../.env.local') });

export function loadEnv() {
  const port = Number(process.env.PORT || 3000);
  const databaseUrl = process.env.DATABASE_URL;
  const mqttUrl = process.env.MQTT_URL || 'mqtt://127.0.0.1:1883';
  const mqttUser = process.env.MQTT_USER || 'kot_server';
  const mqttPassword = process.env.MQTT_PASSWORD || '';
  const defaultRestaurantId = process.env.DEFAULT_RESTAURANT_ID || 'default';

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required (see local-first/.env.example)');
  }

  const listenHost = process.env.LISTEN_HOST || '0.0.0.0';

  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    port,
    listenHost,
    databaseUrl,
    mqttUrl,
    mqttUser,
    mqttPassword,
    defaultRestaurantId,
  };
}
