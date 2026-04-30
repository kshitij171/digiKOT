import { dbAdapter } from '../lib/db/dbAdapter';

export const menuRepository = {
  async listMenuItems() {
    return dbAdapter.select('menu_items', { orderBy: 'name', ascending: true });
  },

  async updateOutOfStock(id, outOfStock) {
    return dbAdapter.update('menu_items', { out_of_stock: outOfStock }, [{ column: 'id', value: id }]);
  },
};
