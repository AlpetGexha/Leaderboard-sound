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

test('sampleKey maps tier counts and kinds onto sample names', async () => {
  const { sampleKey } = await import('../src/domain/announcement.js');
  assert.strictEqual(sampleKey({ kind: 'tier', count: 1 }), 'solved');
  assert.strictEqual(sampleKey({ kind: 'tier', count: 15 }), 'monster_kill');
  assert.strictEqual(sampleKey({ kind: 'tier', count: 6 }), 'tier_6');
  assert.strictEqual(sampleKey({ kind: 'first_blood' }), 'first_blood');
  assert.strictEqual(sampleKey({ kind: 'first_blood_boss_defeated' }), 'first_blood');
  assert.strictEqual(sampleKey({ kind: 'resolve_highlight', sampleKind: 'tier', sampleCount: 2 }), 'double_kill');
  assert.strictEqual(sampleKey({ kind: 'new_ticket' }), 'new_ticket');
});

test('sampleFallbackMs is longer for high tiers', async () => {
  const { sampleFallbackMs } = await import('../src/domain/announcement.js');
  assert.strictEqual(sampleFallbackMs({ kind: 'tier', count: 5 }), 900);
  assert.strictEqual(sampleFallbackMs({ kind: 'tier', count: 2 }), 650);
  assert.strictEqual(sampleFallbackMs({ kind: 'first_blood' }), 650);
});

test('voiceLine always speaks the full line, including the title', async () => {
  const { voiceLine } = await import('../src/domain/announcement.js');
  const a = { title: 'DOUBLE KILL', line: 'DOUBLE KILL, Alpet' };
  assert.strictEqual(voiceLine(a), 'DOUBLE KILL, Alpet');
  assert.strictEqual(voiceLine({ line: 'no title' }), 'no title');
  assert.strictEqual(voiceLine({ title: 'X' }), '');
});

test('randomPriority covers the four equally sized priority buckets', async () => {
  const { randomPriority } = await import('../src/domain/priority.js');
  assert.strictEqual(randomPriority(() => 0), 'low');
  assert.strictEqual(randomPriority(() => 0.25), 'medium');
  assert.strictEqual(randomPriority(() => 0.5), 'high');
  assert.strictEqual(randomPriority(() => 0.9999), 'urgent');
});
