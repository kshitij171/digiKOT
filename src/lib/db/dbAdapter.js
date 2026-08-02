import { apiClient } from '../api/apiClient';

async function run(promise) {
  return promise;
}

export const dbAdapter = {
  async select(table, options = {}) {
    return run(apiClient.select(table, options));
  },

  async insert(table, payload, options = {}) {
    const data = await run(apiClient.insert(table, payload));
    if (options.returning) return data;
    return data;
  },

  async update(table, payload, filters = [], options = {}) {
    const data = await run(apiClient.update(table, payload, filters));
    if (options.returning) return data;
    return data;
  },

  async delete(table, filters = []) {
    return run(apiClient.delete(table, filters));
  },
};
