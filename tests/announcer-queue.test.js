'use strict';
const { test } = require('node:test');
const assert = require('node:assert');

const wait = ms => new Promise(r => setTimeout(r, ms));

test('mergeProfile deep-merges voice, samples and tts but replaces transmission', async () => {
  const { mergeProfile, DEFAULT_PROFILE } = await import('../src/services/announcer/profile.js');
  const merged = mergeProfile({ voice: { rate: 1 }, tts: { enabled: true }, transmission: { src: '/t.mp3' } });
  assert.strictEqual(merged.voice.rate, 1);
  assert.strictEqual(merged.voice.pitch, DEFAULT_PROFILE.voice.pitch);
  assert.strictEqual(merged.tts.enabled, true);
  assert.strictEqual(merged.tts.timeoutMs, 9000);
  assert.deepStrictEqual(merged.transmission, { src: '/t.mp3' });
  assert.strictEqual(merged.background, null);
});

test('mergeProfile with no argument returns the defaults', async () => {
  const { mergeProfile, DEFAULT_PROFILE } = await import('../src/services/announcer/profile.js');
  assert.deepStrictEqual(mergeProfile(), DEFAULT_PROFILE);
});

test('queue plays items serially with a gap between them', async () => {
  const { createQueue } = await import('../src/services/announcer/queue.js');
  const order = [];
  const queue = createQueue({
    gapMs: 30,
    async playOne(item) {
      order.push(`start:${item}`);
      await wait(20);
      order.push(`end:${item}`);
    }
  });

  queue.enqueue('a');
  queue.enqueue('b');
  await wait(150);

  assert.deepStrictEqual(order, ['start:a', 'end:a', 'start:b', 'end:b']);
});

test('queue keeps draining after playOne throws', async () => {
  const { createQueue } = await import('../src/services/announcer/queue.js');
  const seen = [];
  const queue = createQueue({
    gapMs: 10,
    async playOne(item) {
      seen.push(item);
      if (item === 'a') throw new Error('boom');
    }
  });

  queue.enqueue('a');
  queue.enqueue('b');
  await wait(100);

  assert.deepStrictEqual(seen, ['a', 'b']);
});

test('queue reports the items that will play next', async () => {
  const { createQueue } = await import('../src/services/announcer/queue.js');
  const snapshots = [];
  let release;
  const queue = createQueue({
    gapMs: 1,
    playOne() { return new Promise(resolve => { release = resolve; }); },
    onChange(items) { snapshots.push(items); }
  });

  queue.enqueue('first');
  queue.enqueue('second');

  assert.deepStrictEqual(snapshots, [['first'], [], ['second']]);
  release();
  await wait(20);
  assert.deepStrictEqual(snapshots.at(-1), []);
});

test('queue drops the oldest pending items when the cap is reached', async () => {
  const { createQueue } = await import('../src/services/announcer/queue.js');
  let release;
  const seen = [];
  const queue = createQueue({
    gapMs: 1,
    maxPending: 2,
    playOne(item) {
      seen.push(item);
      return new Promise(resolve => { release = resolve; });
    }
  });

  queue.enqueue('playing');
  queue.enqueue('stale');
  queue.enqueue('newer');
  queue.enqueue('newest');
  release();
  await wait(30);

  assert.deepStrictEqual(seen, ['playing', 'newer']);
});
