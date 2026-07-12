'use strict';

const KEEPALIVE_MS = 25000;
const BROADCAST_FRAME_MS = 16;

function createSseHub() {
  const clients = new Set();
  let pendingFrames = [];
  let flushTimer = null;

  function drop(res) {
    clients.delete(res);
    // A client that cannot drain is already behind. Closing it lets EventSource
    // reconnect with one fresh snapshot instead of accumulating an unbounded
    // per-socket write buffer on the server.
    try { res.end?.(); } catch (_) { /* socket is already gone */ }
  }

  function broadcast(payload) {
    const frame = `data: ${JSON.stringify(payload)}\n\n`;
    for (const res of clients) {
      // A slow browser must not retain every full board snapshot in Node's
      // socket buffer. It reconnects and receives the latest state instead.
      if (res.writableNeedDrain) {
        drop(res);
        continue;
      }
      try { res.write(frame); }
      catch (_) { drop(res); }
    }
  }

  function flush() {
    flushTimer = null;
    if (!pendingFrames.length) return;
    const frames = pendingFrames;
    pendingFrames = [];
    const latest = frames[frames.length - 1];
    broadcast({
      ...latest,
      announcements: frames.flatMap(frame => frame.announcements || []),
      effects: frames.flatMap(frame => frame.effects || [])
    });
  }

  return {
    add(res) {
      clients.add(res);
    },
    remove(res) {
      clients.delete(res);
    },
    broadcast,
    broadcastCoalesced(payload) {
      pendingFrames.push(payload);
      if (flushTimer !== null) return;
      flushTimer = setTimeout(flush, BROADCAST_FRAME_MS);
      flushTimer.unref?.();
    },
    keepAliveMs: KEEPALIVE_MS,
    get size() {
      return clients.size;
    }
  };
}

module.exports = { createSseHub, KEEPALIVE_MS, BROADCAST_FRAME_MS };
