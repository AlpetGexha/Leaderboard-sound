'use strict';

async function devOnlyGuard(context) {
  if (context.deps.dev) return null;
  return { status: 404, text: 'not found' };
}

module.exports = { devOnlyGuard };
