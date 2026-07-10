'use strict';
require('../src/test/setup');
const { test } = require('node:test');
const assert = require('node:assert');

test('fmtTime renders a 24-hour zero-padded clock', async () => {
  const { fmtTime } = await import('../src/domain/time.js');
  const ts = new Date('2026-07-10T09:05:00').getTime();
  assert.strictEqual(fmtTime(ts), '09:05');
});

test('servicesFrom falls back to defaults when the snapshot has none', async () => {
  const { servicesFrom, DEFAULT_SERVICES } = await import('../src/domain/snapshot.js');
  assert.deepStrictEqual(servicesFrom(null), DEFAULT_SERVICES);
  assert.deepStrictEqual(servicesFrom({ config: { services: [] } }), DEFAULT_SERVICES);
  assert.deepStrictEqual(servicesFrom({ config: { services: ['KFC'] } }), ['KFC']);
});

test('agentsFrom prefers config, then derives from the leaderboard', async () => {
  const { agentsFrom } = await import('../src/domain/snapshot.js');
  assert.deepStrictEqual(agentsFrom({ config: { agents: ['Alpet'] } }), ['Alpet']);
  assert.deepStrictEqual(
    agentsFrom({ state: { leaderboard: [{ agent: 'Bajram' }, { agent: 'Alpet' }] } }),
    ['Bajram', 'Alpet']
  );
  assert.deepStrictEqual(agentsFrom(null), []);
});
