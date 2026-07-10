'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { webhookSecretGuard } = require('../lib/server/guards/webhookSecret');
const { devOnlyGuard } = require('../lib/server/guards/devOnly');
const { jsonBodyGuard } = require('../lib/server/guards/jsonBody');
const { ttsConfiguredGuard } = require('../lib/server/guards/ttsConfigured');
const { ensureDayGuard } = require('../lib/server/guards/ensureDay');

function ctx(overrides = {}) {
  return {
    req: { headers: {}, method: 'POST', ...overrides.req },
    deps: { dev: false, webhookSecret: 'sekret', fishTts: null, ...overrides.deps },
    ...overrides
  };
}

test('webhookSecretGuard passes a matching header and rejects a mismatch', async () => {
  const ok = ctx({ req: { headers: { 'x-webhook-secret': 'sekret' } } });
  assert.strictEqual(await webhookSecretGuard(ok), null);

  const bad = ctx({ req: { headers: { 'x-webhook-secret': 'wrong' } } });
  assert.deepStrictEqual(await webhookSecretGuard(bad), { status: 401, json: { error: 'bad secret' } });
});

test('webhookSecretGuard passes when no secret is configured', async () => {
  const open = ctx({ deps: { webhookSecret: '' } });
  assert.strictEqual(await webhookSecretGuard(open), null);
});

test('devOnlyGuard hides the route outside dev mode', async () => {
  assert.deepStrictEqual(await devOnlyGuard(ctx()), { status: 404, text: 'not found' });
  assert.strictEqual(await devOnlyGuard(ctx({ deps: { dev: true } })), null);
});

test('ttsConfiguredGuard rejects when fishTts is absent', async () => {
  assert.deepStrictEqual(await ttsConfiguredGuard(ctx()), { status: 503, json: { error: 'tts not configured' } });
  assert.strictEqual(await ttsConfiguredGuard(ctx({ deps: { fishTts: {} } })), null);
});

test('ensureDayGuard rolls the day and never rejects', async () => {
  let rolled = 0;
  const context = ctx({ deps: { arena: { ensureCurrentDay: () => { rolled += 1; } } } });
  assert.strictEqual(await ensureDayGuard(context), null);
  assert.strictEqual(rolled, 1);
});

test('jsonBodyGuard parses the body onto the context', async () => {
  const { Readable } = require('node:stream');
  const req = Readable.from([JSON.stringify({ type: 'ticket.created' })]);
  req.headers = {};
  req.method = 'POST';

  const context = ctx({ req });
  assert.strictEqual(await jsonBodyGuard(context), null);
  assert.deepStrictEqual(context.body, { type: 'ticket.created' });
});

test('jsonBodyGuard rejects malformed JSON', async () => {
  const { Readable } = require('node:stream');
  const req = Readable.from(['{not json']);
  req.headers = {};
  req.method = 'POST';

  const context = ctx({ req });
  assert.deepStrictEqual(await jsonBodyGuard(context), { status: 400, json: { error: 'invalid JSON' } });
});

test('jsonBodyGuard parses an empty body to null, matching the original', async () => {
  const { Readable } = require('node:stream');
  const req = Readable.from([]);
  req.headers = {};
  req.method = 'POST';

  const context = ctx({ req });
  assert.strictEqual(await jsonBodyGuard(context), null);
  assert.strictEqual(context.body, null);
});
