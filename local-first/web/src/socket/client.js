import { io } from 'socket.io-client';

export function createSocket() {
  return io({
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    withCredentials: true,
  });
}
