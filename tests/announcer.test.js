'use strict';
const { test } = require('node:test');
const assert = require('node:assert');

function elements() {
  const make = () => ({
    textContent: '',
    classList: {
      add() {},
      remove() {},
      toggle() {}
    }
  });
  return {
    overlay: make(),
    overlayTitle: make(),
    overlayLine: make(),
    mini: make()
  };
}

function installAudioContext() {
  global.window = global.window || {};
  global.window.AudioContext = class {
    constructor() {
      this.currentTime = 0;
      this.sampleRate = 44100;
      this.destination = {};
    }
    resume() {}
    createOscillator() {
      return {
        type: 'square',
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() { return this; },
        start() {},
        stop() {}
      };
    }
    createGain() {
      return {
        gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() { return this; }
      };
    }
    createBuffer() {
      return { getChannelData() { return new Float32Array(1); } };
    }
    createBufferSource() {
      return { connect() { return this; }, start() {}, set buffer(_) {} };
    }
    createBiquadFilter() {
      return { type: 'lowpass', frequency: { value: 0 }, connect() { return this; } };
    }
  };
}

async function loadAnnouncer(overrides = {}) {
  installAudioContext();
  global.window.speechSynthesis = overrides.speechSynthesis;
  global.window.SpeechSynthesisUtterance = overrides.SpeechSynthesisUtterance;
  global.Audio = overrides.Audio;
  global.window.Audio = overrides.Audio;
  const announcerModule = await import('../src/lib/announcer.js');
  const createAnnouncer = announcerModule.createAnnouncer || announcerModule.default.createAnnouncer;
  const nodes = elements();
  return createAnnouncer({ getOverlayElements: () => nodes });
}

test('unlock does not throw when speech synthesis is unavailable', async () => {
  const announcer = await loadAnnouncer();
  assert.doesNotThrow(() => announcer.unlock());
});

test('unlock starts configured transmission bed after user gesture', async () => {
  const played = [];
  const audios = [];
  class FakeAudio {
    constructor(src) {
      this.src = src;
      this.volume = 1;
      this.loop = false;
      audios.push(this);
    }
    play() {
      played.push(this.src);
      return Promise.resolve();
    }
  }

  const announcer = await loadAnnouncer({ Audio: FakeAudio });
  announcer.configure({
    background: { src: '/sound/transmission.mp3', volume: 0.22, loop: true }
  });
  announcer.unlock();

  assert.strictEqual(audios[0].src, '/sound/transmission.mp3');
  assert.strictEqual(audios[0].volume, 0.22);
  assert.strictEqual(audios[0].loop, true);
  assert.deepStrictEqual(played, ['/sound/transmission.mp3']);
});

test('announcement plays transmission cue before the mapped event sample', async () => {
  const played = [];
  class FakeAudio {
    constructor(src) {
      this.src = src;
      this.volume = 1;
      this.loop = false;
    }
    play() {
      played.push(this.src);
      return Promise.resolve();
    }
  }

  const announcer = await loadAnnouncer({ Audio: FakeAudio });
  announcer.configure({
    transmission: { src: '/sound/transmission.mp3', volume: 0.8, leadMs: 1 },
    samples: { double_kill: '/sound/DoubleKill.mp3' }
  });
  announcer.enqueue({
    kind: 'tier',
    count: 2,
    title: 'DOUBLE KILL',
    line: 'DOUBLE KILL, By Alpet on KFC'
  });

  await new Promise(resolve => setTimeout(resolve, 20));

  assert.deepStrictEqual(played.slice(0, 2), ['/sound/transmission.mp3', '/sound/DoubleKill.mp3']);
});

test('announcement plays Fish TTS audio for the custom message after local sounds', async () => {
  const played = [];
  class FakeAudio {
    constructor(src) {
      this.src = src;
      this.volume = 1;
      this.loop = false;
    }
    play() {
      played.push(this.src);
      setTimeout(() => { if (this.onended) this.onended(); }, 0);
      return Promise.resolve();
    }
  }

  const announcer = await loadAnnouncer({ Audio: FakeAudio });
  announcer.configure({
    transmission: { src: '/sound/transmission.mp3', leadMs: 1, durationMs: 2 },
    samples: { double_kill: '/sound/DoubleKill.mp3' },
    tts: { enabled: true, volume: 1 }
  });
  announcer.enqueue({
    kind: 'tier',
    count: 2,
    title: 'DOUBLE KILL',
    line: 'DOUBLE KILL, By Alpet on KFC'
  });

  await new Promise(resolve => setTimeout(resolve, 780));

  assert.strictEqual(played[0], '/sound/transmission.mp3');
  assert.strictEqual(played[1], '/sound/DoubleKill.mp3');
  assert.match(played[2], /^\/api\/tts\?/);
  assert.strictEqual(new URLSearchParams(played[2].split('?')[1]).get('text'), 'DOUBLE KILL, By Alpet on KFC');
});
