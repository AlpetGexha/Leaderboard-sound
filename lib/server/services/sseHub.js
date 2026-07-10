'use strict';

const KEEPALIVE_MS = 25000;

function createSseHub() {
  const clients = new Set();

  return {
    add(res) {
      clients.add(res);
    },
    remove(res) {
      clients.delete(res);
    },
    broadcast(payload) {
      const frame = `data: ${JSON.stringify(payload)}\n\n`;
      for (const res of clients) res.write(frame);
    },
    keepAliveMs: KEEPALIVE_MS,
    get size() {
      return clients.size;
    }
  };
}

module.exports = { createSseHub, KEEPALIVE_MS };
