/** Versioned MQTT topic helpers (v1). */

export function topicKitchenEvents(restaurantId) {
  return `kot/v1/${restaurantId}/kitchen/events`;
}

export function topicWaiterEvents(restaurantId, waiterId) {
  return `kot/v1/${restaurantId}/waiter/${waiterId}/events`;
}

export function topicTableEvents(restaurantId, tableNumber) {
  return `kot/v1/${restaurantId}/table/${tableNumber}/events`;
}

export function topicDeviceStatus(restaurantId, deviceId) {
  return `kot/v1/${restaurantId}/device/${deviceId}/status`;
}

export function topicDeviceAck(restaurantId, deviceId) {
  return `kot/v1/${restaurantId}/device/${deviceId}/ack`;
}
