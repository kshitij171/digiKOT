import { dbAdapter } from '../lib/db/dbAdapter';

export const menuRepository = {
  /**
   * Lists menu items ordered by name.
   * @returns {Promise<Array<object>>}
   */
  async listMenuItems() {
    try {
      return dbAdapter.select('menu_items', { orderBy: 'name', ascending: true });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Lists categories ordered by display order.
   * @returns {Promise<Array<object>>}
   */
  async listCategories() {
    try {
      return dbAdapter.select('categories', { orderBy: 'display_order', ascending: true });
    } catch (err) {
      throw err;
    }
  },

  /**
   * Updates a menu item's out_of_stock flag.
   * @param {string} id
   * @param {boolean} outOfStock
   * @returns {Promise<any>}
   */
  async updateOutOfStock(id, outOfStock) {
    try {
      return dbAdapter.update(
        'menu_items',
        { out_of_stock: outOfStock, updated_at: new Date().toISOString() },
        [{ column: 'id', value: id }]
      );
    } catch (err) {
      throw err;
    }
  },
};
