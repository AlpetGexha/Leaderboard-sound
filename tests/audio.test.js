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
  // Neither handler ever fires, so only the 300ms timeout can settle this.
  const audio = { duration: NaN, addEventListener() {}, load() {} };

  const started = Date.now();
  const result = await measuredAudioMs(audio, 777);
  const elapsed = Date.now() - started;

  assert.strictEqual(result, 777);
  // Wall-clock bounds, deliberately wide so a loaded machine cannot flake them.
  // The lower bound catches a timeout that resolves immediately; the upper bound
  // catches a regression to a much longer timeout, which would add dead air
  // before every sample whose metadata never loads.
  assert.ok(elapsed >= 250, `expected to wait for the ~300ms metadata timeout, waited ${elapsed}ms`);
  assert.ok(elapsed < 1500, `expected the ~300ms metadata timeout, waited ${elapsed}ms`);
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

test('audioContext is not ready until resume, and tone is a no-op before that', async () => {
  const { createAudioContext } = await import('../src/services/audio/audioContext.js');
  let constructed = 0;
  global.window = {
    AudioContext: class {
      constructor() {
        constructed += 1;
        this.currentTime = 0;
        this.sampleRate = 44100;
        this.destination = {};
      }
      resume() {}
      createOscillator() {
        return {
          frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
          connect() { return this; }, start() {}, stop() {}
        };
      }
      createGain() {
        return {
          gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
          connect() { return this; }
        };
      }
    }
  };

  const engine = createAudioContext();
  assert.strictEqual(engine.isReady(), false);
  assert.doesNotThrow(() => engine.tone(440, 0, 0.1));
  assert.strictEqual(constructed, 0);

  engine.resume();
  assert.strictEqual(engine.isReady(), true);
  assert.strictEqual(constructed, 1);

  engine.resume();
  assert.strictEqual(constructed, 1, 'resume must not construct a second context');

  assert.doesNotThrow(() => engine.tone(440, 0, 0.1, { slideTo: 220 }));
  delete global.window;
});

test('createAudioContext survives a browser with no AudioContext', async () => {
  const { createAudioContext } = await import('../src/services/audio/audioContext.js');
  global.window = {};
  const engine = createAudioContext();
  assert.doesNotThrow(() => engine.resume());
  assert.strictEqual(engine.isReady(), false);
  delete global.window;
});

test('stingers return their advertised durations', async () => {
  const { createStingers } = await import('../src/services/audio/stingers.js');
  const calls = [];
  const engine = {
    isReady: () => true,
    tone: (...args) => calls.push(['tone', ...args]),
    noiseHit: (...args) => calls.push(['noise', ...args])
  };
  const stingers = createStingers(engine);

  assert.strictEqual(stingers.blip(), 260);
  assert.strictEqual(stingers.solved(), 480);
  assert.strictEqual(stingers.firstBlood(), 1400);
  // tier(2): endAt = 0.08 + 2 * 0.09 = 0.26 -> round((0.26 + 0.6) * 1000) = 860
  assert.strictEqual(stingers.tier(2), 860);
  // tier(10) clamps notes to 8: endAt = 0.08 + 8 * 0.09 = 0.80 -> 1400
  assert.strictEqual(stingers.tier(10), 1400);
  assert.ok(calls.length > 0);
});

test('selectStinger suppresses generated audio when a sample exists', async () => {
  const { selectStinger } = await import('../src/services/audio/stingers.js');
  const stingers = { firstBlood: () => 1400, tier: () => 860, solved: () => 480 };

  assert.strictEqual(selectStinger(stingers, { kind: 'first_blood' }, true), null);
  assert.strictEqual(selectStinger(stingers, { kind: 'new_ticket' }, false), null);
  assert.strictEqual(selectStinger(stingers, { kind: 'unknown' }, false), null);
  assert.strictEqual(selectStinger(stingers, { kind: 'first_blood' }, false)(), 1400);
  assert.strictEqual(selectStinger(stingers, { kind: 'tier', count: 3 }, false)(), 860);
  assert.strictEqual(selectStinger(stingers, { kind: 'tier', count: 1 }, false)(), 480);
});

test('createSample builds an audio element only when the profile maps the key', async () => {
  const { createSample } = await import('../src/services/audio/samples.js');
  global.window = { Audio: class { constructor(src) { this.src = src; } } };

  const profile = { samples: { double_kill: '/sound/DoubleKill.mp3' }, sampleVolume: 0.9 };
  const audio = createSample({ kind: 'tier', count: 2 }, profile);
  assert.strictEqual(audio.src, '/sound/DoubleKill.mp3');
  assert.strictEqual(audio.volume, 0.9);

  assert.strictEqual(createSample({ kind: 'tier', count: 3 }, profile), null);
  assert.strictEqual(createSample({ kind: 'tier', count: 2 }, { samples: {} }), null);
  delete global.window;
});

test('ttsUrl encodes the spoken line, kind, title, and optional count', async () => {
  const { ttsUrl } = await import('../src/services/audio/ttsClient.js');
  const url = ttsUrl({ kind: 'tier', count: 2, title: 'DOUBLE KILL', line: 'DOUBLE KILL, Alpet' });
  const params = new URL(url, 'http://x').searchParams;
  assert.strictEqual(params.get('text'), 'DOUBLE KILL, Alpet');
  assert.strictEqual(params.get('kind'), 'tier');
  assert.strictEqual(params.get('title'), 'DOUBLE KILL');
  assert.strictEqual(params.get('count'), '2');

  const noCount = ttsUrl({ kind: 'new_ticket', title: 'NEW TICKET', line: 'New ticket by Alpet' });
  assert.strictEqual(new URL(noCount, 'http://x').searchParams.get('count'), null);
});

test('playAiVoice resolves false when tts is disabled or the line is empty', async () => {
  const { playAiVoice } = await import('../src/services/audio/ttsClient.js');
  assert.strictEqual(await playAiVoice({ kind: 'x', line: 'hi' }, { tts: { enabled: false } }), false);
  assert.strictEqual(await playAiVoice({ kind: 'x', line: '' }, { tts: { enabled: true } }), false);
});

test('playAiVoice resolves true when the audio finishes', async () => {
  const { playAiVoice } = await import('../src/services/audio/ttsClient.js');
  global.window = {
    Audio: class {
      constructor(src) { this.src = src; }
      play() { setTimeout(() => this.onended(), 0); return Promise.resolve(); }
    }
  };
  const ok = await playAiVoice({ kind: 'x', line: 'hi' }, { tts: { enabled: true, volume: 1 } });
  assert.strictEqual(ok, true);
  delete global.window;
});

test('playAiVoice resolves false when the audio errors', async () => {
  const { playAiVoice } = await import('../src/services/audio/ttsClient.js');
  global.window = {
    Audio: class {
      constructor(src) { this.src = src; }
      play() { setTimeout(() => this.onerror(), 0); return Promise.resolve(); }
    }
  };
  const ok = await playAiVoice({ kind: 'x', line: 'hi' }, { tts: { enabled: true } });
  assert.strictEqual(ok, false);
  delete global.window;
});
