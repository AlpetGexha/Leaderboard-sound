'use strict';

// Side-effecting guard: rolls the board to today before the request is handled.
// It never rejects; it returns null so the request always proceeds. Listed first
// on /api/events so a request arriving across midnight with a bad secret still
// resets the board, matching the original http-server.js ordering.
async function ensureDayGuard(context) {
  context.deps.arena.ensureCurrentDay();
  return null;
}

module.exports = { ensureDayGuard };
