'use strict';
require('../src/test/setup');
const { test } = require('node:test');
const assert = require('node:assert');

test('heatLevel maps solve counts onto kill-tier auras', async () => {
  const { heatLevel } = await import('../src/domain/fx.js');
  assert.strictEqual(heatLevel(0), 0);
  assert.strictEqual(heatLevel(2), 0);
  assert.strictEqual(heatLevel(3), 1);
  assert.strictEqual(heatLevel(4), 1);
  assert.strictEqual(heatLevel(5), 2);
  assert.strictEqual(heatLevel(9), 2);
  assert.strictEqual(heatLevel(10), 3);
  assert.strictEqual(heatLevel(25), 3);
});

test('burstParticles is deterministic under an injected rng and stays in range', async () => {
  const { burstParticles } = await import('../src/domain/fx.js');
  const rng = () => 0.5;
  const a = burstParticles(12, rng);
  const b = burstParticles(12, rng);
  assert.strictEqual(a.length, 12);
  assert.deepStrictEqual(a, b);
  for (const p of a) {
    assert.strictEqual(typeof p.dx, 'number');
    assert.strictEqual(typeof p.dy, 'number');
    const distance = Math.hypot(p.dx, p.dy);
    assert.ok(distance >= 35 && distance <= 115, `distance ${distance} out of range`);
    assert.ok(p.size >= 4 && p.size <= 10, `size ${p.size} out of range`);
    assert.ok(p.durationMs >= 500 && p.durationMs <= 900, `duration ${p.durationMs} out of range`);
  }
});

test('burstParticles defaults to 14 particles', async () => {
  const { burstParticles } = await import('../src/domain/fx.js');
  assert.strictEqual(burstParticles().length, 14);
});
