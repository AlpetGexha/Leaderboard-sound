'use strict';
require('../src/test/setup');
const { test } = require('node:test');
const assert = require('node:assert');

test('fetchState parses the snapshot and swallows transport failures', async () => {
  const { fetchState } = await import('../src/services/arenaApi.js');

  global.fetch = () => Promise.resolve({ json: () => Promise.resolve({ day: '2026-07-10' }) });
  assert.deepStrictEqual(await fetchState(), { day: '2026-07-10' });

  global.fetch = () => Promise.reject(new Error('offline'));
  assert.strictEqual(await fetchState(), null);
  delete global.fetch;
});

test('postEvent sends the webhook secret header', async () => {
  const { postEvent } = await import('../src/services/arenaApi.js');
  let seen;
  global.fetch = (url, options) => { seen = { url, options }; return Promise.resolve({ ok: true, status: 200 }); };

  await postEvent({ type: 'ticket.created', agent: 'Alpet' }, 'sekret');

  assert.strictEqual(seen.url, '/api/events');
  assert.strictEqual(seen.options.method, 'POST');
  assert.strictEqual(seen.options.headers['X-Webhook-Secret'], 'sekret');
  assert.strictEqual(seen.options.headers['Content-Type'], 'application/json');
  assert.deepStrictEqual(JSON.parse(seen.options.body), { type: 'ticket.created', agent: 'Alpet' });
  delete global.fetch;
});

test('postDevReset posts to the dev route', async () => {
  const { postDevReset } = await import('../src/services/arenaApi.js');
  let seen;
  global.fetch = (url, options) => { seen = { url, options }; return Promise.resolve({ ok: true }); };
  await postDevReset();
  assert.strictEqual(seen.url, '/api/dev/reset');
  assert.strictEqual(seen.options.method, 'POST');
  delete global.fetch;
});

test('fetch is resolved at call time, not captured at module load', async () => {
  const { postDevReset } = await import('../src/services/arenaApi.js');
  // tests/app.test.js assigns global.fetch AFTER importing App.jsx. If arenaApi
  // captured fetch at module scope, that assignment would never be seen.
  let called = false;
  global.fetch = () => { called = true; return Promise.resolve({ ok: true }); };
  await postDevReset();
  assert.strictEqual(called, true);
  delete global.fetch;
});
