'use strict';
require('../src/test/setup');
const { test } = require('node:test');
const assert = require('node:assert');

test('fmtTime renders a 24-hour zero-padded clock', async () => {
  const { fmtTime } = await import('../src/domain/time.js');
  const ts = new Date('2026-07-10T09:05:00').getTime();
  assert.strictEqual(fmtTime(ts), '09:05');
});
