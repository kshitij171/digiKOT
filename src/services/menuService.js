import { menuRepository } from '../repositories/menuRepository';
import { realtimeAdapter } from '../realtime/realtimeAdapter';
import { createSubscriptionController } from './subscriptionController';

function mapItem(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: row.price,
    description: row.description,
    imageUrl: row.image_url,
    outOfStock: row.out_of_stock,
  };
}

export const menuService = {
  async listMenuItems() {
    const rows = await menuRepository.listMenuItems();
    return rows.map(mapItem);
  },

  subscribeMenu(onData) {
    const load = async () => {
      const items = await this.listMenuItems();
      onData(items);
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

  async setOutOfStock(itemId, isOutOfStock) {
    await menuRepository.updateOutOfStock(itemId, isOutOfStock);
  },
};
