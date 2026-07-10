'use strict';
const { test } = require('node:test');
const assert = require('node:assert');

test('getAudioCtor prefers window.Audio then falls back to globalThis.Audio', async () => {
  const { getAudioCtor, getWindow } = await import('../src/services/audio/browserEnv.js');
  class WinAudio {}
  global.window = { Audio: WinAudio };
  assert.strictEqual(getAudioCtor(), WinAudio);
  assert.strictEqual(getWindow(), global.window);

  global.window = {};
  class GlobalAudio {}
  global.Audio = GlobalAudio;
  assert.strictEqual(getAudioCtor(), GlobalAudio);

  delete global.window;
  delete global.Audio;
});
