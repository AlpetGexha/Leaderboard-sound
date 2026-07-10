'use strict';
const { sendJson } = require('../http/responses');

async function resetDayAction(context) {
  const { res, deps } = context;
  const { store, arena, sse } = deps;

  store.clear();
  arena.reset();
  sse.broadcast(arena.snapshot({ dayRolled: true }));
  return sendJson(res, 200, { ok: true });
}

module.exports = { resetDayAction };
