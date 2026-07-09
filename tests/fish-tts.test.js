'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createFishTts, voiceForAnnouncement, FISH_TTS_URL } = require('../lib/fish-tts');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fish-tts-'));
}

test('voice selection uses Mortal Combat for solved tickets and Dramatic Character Male for first blood', () => {
  const fishAudio = {
    voices: {
      solved: 'd13f84b987ad4f22b56d2b47f4eb838e',
      first_blood: '7a18a1851d2649108c48ec9f2c80eb2c',
      default: '7a18a1851d2649108c48ec9f2c80eb2c'
    }
  };

  assert.strictEqual(
    voiceForAnnouncement({ kind: 'tier', count: 1 }, fishAudio),
    'd13f84b987ad4f22b56d2b47f4eb838e'
  );
  assert.strictEqual(
    voiceForAnnouncement({ kind: 'first_blood' }, fishAudio),
    '7a18a1851d2649108c48ec9f2c80eb2c'
  );
});

test('synthesize posts Fish Audio request with configured reference voice and caches mp3 bytes', async () => {
  const calls = [];
  const cacheDir = tmpDir();
  const tts = createFishTts({
    apiKey: 'secret-key',
    cacheDir,
    fishAudio: {
      model: 's2.1-pro-free',
      voices: { solved: 'd13f84b987ad4f22b56d2b47f4eb838e' }
    },
    fetchImpl(url, options) {
      calls.push({ url, options });
      return Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(Uint8Array.from([1, 2, 3]).buffer)
      });
    }
  });

  const first = await tts.synthesize({
    text: 'SOLVED, By Alpet on KFC',
    announcement: { kind: 'tier', count: 1 }
  });
  const second = await tts.synthesize({
    text: 'SOLVED, By Alpet on KFC',
    announcement: { kind: 'tier', count: 1 }
  });

  assert.deepStrictEqual([...first], [1, 2, 3]);
  assert.deepStrictEqual([...second], [1, 2, 3]);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, FISH_TTS_URL);
  assert.strictEqual(calls[0].options.headers.Authorization, 'Bearer secret-key');
  assert.strictEqual(calls[0].options.headers.model, 's2.1-pro-free');
  assert.strictEqual(JSON.parse(calls[0].options.body).reference_id, 'd13f84b987ad4f22b56d2b47f4eb838e');
});
