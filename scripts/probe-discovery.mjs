#!/usr/bin/env node
/**
 * Send DIGIKOT_DISCOVER probe; print first DIGIKOT_SERVER reply.
 * Validates responder logic only (same machine — does not test macOS firewall).
 */
import dgram from 'node:dgram';

const PORT = 50505;
const PROBE = 'DIGIKOT_DISCOVER v1';

const socket = dgram.createSocket('udp4');

socket.on('message', (msg, rinfo) => {
  const text = msg.toString('utf8').trim();
  if (!text.startsWith('DIGIKOT_SERVER')) return;
  console.log(`reply from ${rinfo.address}:${rinfo.port}: ${text}`);
  socket.close();
  process.exit(0);
});

socket.on('error', (err) => {
  console.error('probe error:', err.message);
  process.exit(1);
});

socket.bind(0, () => {
  socket.setBroadcast(true);
  socket.send(PROBE, PORT, '255.255.255.255', (err) => {
    if (err) {
      console.error('send failed:', err.message);
      process.exit(1);
    }
    console.log(`sent probe to 255.255.255.255:${PORT}`);
  });
});

setTimeout(() => {
  console.error('no reply within 5s (is npm run install:full running?)');
  socket.close();
  process.exit(1);
}, 5000);
