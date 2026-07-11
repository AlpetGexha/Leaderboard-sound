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
      for (const res of clients) {
        // A write to a destroyed socket must not abort delivery to the other
        // clients; drop the dead one. (Deleting the current element mid-iteration
        // is safe for a Set.)
        try { res.write(frame); }
        catch (_) { clients.delete(res); }
      }
    },
    keepAliveMs: KEEPALIVE_MS,
    get size() {
      return clients.size;
    }
  };
}

module.exports = { createSseHub, KEEPALIVE_MS };
