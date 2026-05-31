import { menuRepository } from '../repositories/menuRepository';
import { realtimeAdapter } from '../realtime/realtimeAdapter';
import { createSubscriptionController } from './subscriptionController';

function mapItem(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    categoryId: row.category_id || null,
    price: Number(row.price),
    description: row.description || '',
    imageUrl: row.image_url || '',
    outOfStock: row.out_of_stock === true,
    isVegetarian: row.is_vegetarian === true,
  };
}

function mapCategory(row) {
  return {
    id: row.id,
    name: row.name,
    displayOrder: row.display_order,
    icon: row.icon || '',
  };
}

export const menuService = {
  /**
   * Lists menu items sorted by name.
   * @returns {Promise<Array<object>>} Array of menu item view models.
   */
  async listMenuItems() {
    try {
      const rows = await menuRepository.listMenuItems();
      return rows.map(mapItem);
    } catch (err) {
      throw err;
    }
  },

  /**
   * Lists menu categories for UI grouping.
   * Returns [] when the categories table isn't available yet.
   * @returns {Promise<Array<object>>}
   */
  async listCategories() {
    try {
      try {
        const rows = await menuRepository.listCategories();
        return rows.map(mapCategory);
      } catch {
        return [];
      }
    } catch (err) {
      throw err;
    }
  },

  /**
   * Subscribes to menu updates and emits latest list to callback.
   * @param {(rows: Array<object>) => void} onData
   * @returns {() => void} Cleanup function.
   */
  subscribeMenu(onData) {
    const load = async () => {
      try {
        const items = await this.listMenuItems();
        onData(items);
      } catch (err) {
        throw err;
      }
    };
    return createSubscriptionController({
      load,
      subscribeFns: [
        (onEvent, onStatus) =>
          realtimeAdapter.subscribe({
            channelName: 'menu-watch',
            table: 'menu_items',
            onEvent,
            onStatus,
          }),
      ],
    });
  },

  /**
   * Sets a menu item's out-of-stock flag.
   * @param {string} itemId
   * @param {boolean} isOutOfStock
   * @returns {Promise<void>}
   */
  async setOutOfStock(itemId, isOutOfStock) {
    try {
      await menuRepository.updateOutOfStock(itemId, isOutOfStock);
    } catch (err) {
      throw err;
    }
  },
};
