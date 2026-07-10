'use strict';
const { sendJson } = require('../http/responses');

async function getStateAction(context) {
  return sendJson(context.res, 200, context.deps.arena.snapshot());
}

module.exports = { getStateAction };
