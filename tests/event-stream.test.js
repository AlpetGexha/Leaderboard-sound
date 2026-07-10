'use strict';
require('../src/test/setup');
const { test, afterEach } = require('node:test');
const assert = require('node:assert');

afterEach(() => global.__resetBrowserMocks());

test('subscribe opens /events and forwards parsed frames', async () => {
  const { subscribe } = await import('../src/services/eventStream.js');
  const frames = [];
  const opens = [];

  const unsubscribe = subscribe({
    onOpen: () => opens.push(true),
    onMessage: msg => frames.push(msg),
    onError: () => {}
  });

  const es = global.EventSource.instances[0];
  assert.strictEqual(es.url, '/events');

  es.onopen();
  es.onmessage({ data: JSON.stringify({ day: '2026-07-10' }) });

  assert.deepStrictEqual(opens, [true]);
  assert.deepStrictEqual(frames, [{ day: '2026-07-10' }]);

  unsubscribe();
  assert.strictEqual(es.closed, true);
});

test('handlers are assigned as properties, not via addEventListener', async () => {
  const { subscribe } = await import('../src/services/eventStream.js');
  // src/test/setup.js's MockEventSource has no addEventListener, and
  // tests/app.test.js drives EventSource.instances[0].onmessage directly.
  subscribe({ onMessage: () => {} });
  const es = global.EventSource.instances[0];
  assert.strictEqual(typeof es.onmessage, 'function');
  assert.strictEqual(typeof es.onopen, 'function');
  assert.strictEqual(typeof es.onerror, 'function');
});

test('a malformed frame is dropped without throwing or stopping later frames', async () => {
  const { subscribe } = await import('../src/services/eventStream.js');
  const frames = [];
  subscribe({ onMessage: msg => frames.push(msg) });

  const es = global.EventSource.instances[0];
  assert.doesNotThrow(() => es.onmessage({ data: 'not json{' }));
  es.onmessage({ data: JSON.stringify({ ok: true }) });

  assert.deepStrictEqual(frames, [{ ok: true }]);
});

test('onError fires when the stream errors', async () => {
  const { subscribe } = await import('../src/services/eventStream.js');
  let errors = 0;
  subscribe({ onError: () => { errors += 1; } });
  global.EventSource.instances[0].onerror();
  assert.strictEqual(errors, 1);
});
