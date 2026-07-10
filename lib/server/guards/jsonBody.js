'use strict';
const { readBody } = require('../http/readBody');

// Parses the request body onto context.body. An empty body parses to null,
// which matches the original `JSON.parse(await readBody(req) || 'null')`.
async function jsonBodyGuard(context) {
  try {
    context.body = JSON.parse((await readBody(context.req)) || 'null');
    return null;
  } catch (_) {
    return { status: 400, json: { error: 'invalid JSON' } };
  }
}

module.exports = { jsonBodyGuard };
