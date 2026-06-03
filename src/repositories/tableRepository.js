import { dbAdapter } from '../lib/db/dbAdapter';

export const tableRepository = {
  /**
   * Lists restaurant tables.
   * @returns {Promise<Array<object>>}
   */
  async listTables() {
    try {
      return dbAdapter.select('restaurant_tables', {
        orderBy: 'table_number',
        ascending: true,
      });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Updates a table by table_number.
   * @param {number} tableNumber
   * @param {object} payload
   * @returns {Promise<any>}
   */
  async updateByTableNumber(tableNumber, payload) {
    try {
      return dbAdapter.update('restaurant_tables', payload, [{ column: 'table_number', value: tableNumber }]);
    } catch (err) {
      throw err;
    }
  },

  /**
   * Gets a table row by table_number.
   * @param {number} tableNumber
   * @returns {Promise<object|null>}
   */
  async getByTableNumber(tableNumber) {
    try {
      return dbAdapter.select('restaurant_tables', {
        filters: [{ column: 'table_number', value: tableNumber }],
        single: true,
      });
    } catch (err) {
      throw err;
    }
  },
};
