import { randomBytes } from 'node:crypto';

export const SETUP_TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

/** @type {{ tokens: Map<string, { expiresAt: number }>, commands: Map<string, object>, restaurantWifi: object | null } | null} */
let store = null;

export function getSetupStore() {
  if (!store) {
    store = {
      tokens: new Map(),
      commands: new Map(),
      restaurantWifi: null,
    };
  }
  return store;
}

export function newCommandId() {
  return randomBytes(8).toString('hex');
}
