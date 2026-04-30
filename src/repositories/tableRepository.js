import { dbAdapter } from '../lib/db/dbAdapter';

export const tableRepository = {
  async listTables() {
    return dbAdapter.select('restaurant_tables', {
      orderBy: 'table_number',
      ascending: true,
    });
  },

  async updateByTableNumber(tableNumber, payload) {
    return dbAdapter.update('restaurant_tables', payload, [{ column: 'table_number', value: tableNumber }]);
  },

  async getByTableNumber(tableNumber) {
    return dbAdapter.select('restaurant_tables', {
      filters: [{ column: 'table_number', value: tableNumber }],
      single: true,
    });
  },
};
