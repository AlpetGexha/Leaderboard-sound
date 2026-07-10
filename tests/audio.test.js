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

test('makeAudio returns null without a src or without an Audio constructor', async () => {
  const { makeAudio } = await import('../src/services/audio/audioElement.js');
  global.window = { Audio: class { constructor(src) { this.src = src; } } };
  assert.strictEqual(makeAudio(''), null);

  global.window = {};
  delete global.Audio;
  assert.strictEqual(makeAudio('/a.mp3'), null);
  delete global.window;
});

test('measuredAudioMs resolves a known duration immediately', async () => {
  const { measuredAudioMs } = await import('../src/services/audio/audioElement.js');
  assert.strictEqual(await measuredAudioMs({ duration: 1.234 }, 650), 1234);
});

test('measuredAudioMs returns 0 for a missing audio element', async () => {
  const { measuredAudioMs } = await import('../src/services/audio/audioElement.js');
  assert.strictEqual(await measuredAudioMs(null, 650), 0);
});

test('measuredAudioMs falls back after the metadata timeout', async () => {
  const { measuredAudioMs } = await import('../src/services/audio/audioElement.js');
  const audio = { duration: NaN, addEventListener() {}, load() {} };
  assert.strictEqual(await measuredAudioMs(audio, 777), 777);
});

test('playAudio swallows a rejected play promise and reports that it started', async () => {
  const { playAudio } = await import('../src/services/audio/audioElement.js');
  const audio = { play: () => Promise.reject(new Error('blocked')) };
  assert.strictEqual(playAudio(audio), true);
  assert.strictEqual(playAudio(null), false);
});

test('stopAudio tolerates a read-only currentTime', async () => {
  const { stopAudio } = await import('../src/services/audio/audioElement.js');
  let paused = false;
  const audio = { pause() { paused = true; }, set currentTime(_) { throw new Error('read-only'); } };
  assert.doesNotThrow(() => stopAudio(audio));
  assert.strictEqual(paused, true);
});
