'use strict';
const { test } = require('node:test');
const assert = require('node:assert');

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

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function loadAnnouncer(overrides = {}) {
  installAudioContext();
  if (overrides.AudioContext) {
    global.window.AudioContext = overrides.AudioContext;
  }
  global.window.speechSynthesis = overrides.speechSynthesis;
  global.window.SpeechSynthesisUtterance = overrides.SpeechSynthesisUtterance;
  global.Audio = overrides.Audio;
  global.window.Audio = overrides.Audio;
  const announcerModule = await import('../src/services/announcer/createAnnouncer.js');
  const createAnnouncer = announcerModule.createAnnouncer || announcerModule.default.createAnnouncer;
  return createAnnouncer({ onShow: () => {}, onHide: () => {} });
}

test('unlock does not throw when speech synthesis is unavailable', async () => {
  const announcer = await loadAnnouncer();
  assert.doesNotThrow(() => announcer.unlock());
});

test('announcement does not fall back to browser speech when Fish TTS is unavailable', async () => {
  let browserSpeaks = 0;
  const played = [];
  class FakeAudio {
    constructor(src) {
      this.src = src;
      this.volume = 1;
      this.loop = false;
      this.duration = 10;
    }
    play() {
      played.push(this.src);
      return Promise.resolve();
    }
    pause() {}
  }

  const announcer = await loadAnnouncer({
    Audio: FakeAudio,
    speechSynthesis: {
      getVoices() { return []; },
      speak() { browserSpeaks += 1; }
    },
    SpeechSynthesisUtterance: class {
      constructor(text) {
        this.text = text;
      }
    }
  });
  announcer.configure({
    transmission: { src: '/sound/transmission.mp3', leadMs: 1 },
    tts: { enabled: false }
  });
  announcer.enqueue({
    kind: 'new_ticket',
    title: 'NEW TICKET',
    line: 'NEW TICKET, By Alpet on KFC'
  });

  await wait(2600);

  assert.deepStrictEqual(played, ['/sound/transmission.mp3']);
  assert.strictEqual(browserSpeaks, 0);
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
      this.duration = src.includes('DoubleKill') ? 0.02 : 10;
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

  await wait(30);

  assert.deepStrictEqual(played.slice(0, 2), ['/sound/transmission.mp3', '/sound/DoubleKill.mp3']);
});

test('announcement waits 2 seconds before starting the mapped event sample by default', async () => {
  const played = [];
  class FakeAudio {
    constructor(src) {
      this.src = src;
      this.volume = 1;
      this.loop = false;
      this.duration = src.includes('DoubleKill') ? 0.02 : 10;
    }
    play() {
      played.push(this.src);
      return Promise.resolve();
    }
  }

  const announcer = await loadAnnouncer({ Audio: FakeAudio });
  announcer.configure({
    transmission: { src: '/sound/transmission.mp3' },
    samples: { double_kill: '/sound/DoubleKill.mp3' }
  });
  announcer.enqueue({
    kind: 'tier',
    count: 2,
    title: 'DOUBLE KILL',
    line: 'DOUBLE KILL, By Alpet on KFC'
  });

  await wait(1900);
  assert.deepStrictEqual(played, ['/sound/transmission.mp3']);

  await wait(150);
  assert.deepStrictEqual(played.slice(0, 2), ['/sound/transmission.mp3', '/sound/DoubleKill.mp3']);
});

test('announcement keeps transmission running under the event sample and Fish TTS voice until the end', async () => {
  const played = [];
  const audios = [];
  class FakeAudio {
    constructor(src) {
      this.src = src;
      this.volume = 1;
      this.loop = false;
      this.duration = src.includes('DoubleKill') ? 0.03 : 20;
      this.paused = false;
      audios.push(this);
    }
    play() {
      played.push(this.src);
      if (this.src.includes('DoubleKill')) {
        const transmission = audios.find(audio => audio.src === '/sound/transmission.mp3');
        assert.strictEqual(transmission.loop, true);
        assert.strictEqual(transmission.paused, false);
      }
      if (this.src.startsWith('/api/tts')) setTimeout(() => { if (this.onended) this.onended(); }, 0);
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
  }

  const announcer = await loadAnnouncer({ Audio: FakeAudio });
  announcer.configure({
    transmission: { src: '/sound/transmission.mp3', leadMs: 1 },
    samples: { double_kill: '/sound/DoubleKill.mp3' },
    tts: { enabled: true, volume: 1 }
  });
  announcer.enqueue({
    kind: 'tier',
    count: 2,
    title: 'DOUBLE KILL',
    line: 'DOUBLE KILL, By Alpet on KFC'
  });

  await wait(520);

  assert.strictEqual(played[0], '/sound/transmission.mp3');
  assert.strictEqual(played[1], '/sound/DoubleKill.mp3');
  assert.match(played[2], /^\/api\/tts\?/);
  const transmission = audios.find(audio => audio.src === '/sound/transmission.mp3');
  assert.strictEqual(transmission.paused, true);
});

test('new ticket announcement does not add a second generated blip before the voice', async () => {
  const played = [];
  let oscillatorStarts = 0;
  const CountingAudioContext = class {
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
        start() { oscillatorStarts += 1; },
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
  class FakeAudio {
    constructor(src) {
      this.src = src;
      this.volume = 1;
      this.loop = false;
      this.duration = src.startsWith('/api/tts') ? 0.02 : 10;
    }
    play() {
      played.push(this.src);
      if (this.src.startsWith('/api/tts')) setTimeout(() => { if (this.onended) this.onended(); }, 0);
      return Promise.resolve();
    }
    pause() {}
  }

  const announcer = await loadAnnouncer({ Audio: FakeAudio, AudioContext: CountingAudioContext });
  announcer.unlock();
  announcer.configure({
    transmission: { src: '/sound/transmission.mp3', leadMs: 1 },
    tts: { enabled: true, volume: 1 }
  });
  announcer.enqueue({
    kind: 'new_ticket',
    title: 'NEW TICKET',
    line: 'NEW TICKET, By Alpet on KFC'
  });

  await wait(540);

  assert.strictEqual(oscillatorStarts, 0);
  assert.strictEqual(played[0], '/sound/transmission.mp3');
  assert.match(played[1], /^\/api\/tts\?/);
  assert.strictEqual(played.length, 2);
});

test('tier announcements with mapped samples do not also play generated browser stingers', async () => {
  const played = [];
  let generatedStarts = 0;
  const CountingAudioContext = class {
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
        start() { generatedStarts += 1; },
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
      return {
        connect() { return this; },
        start() { generatedStarts += 1; },
        set buffer(_) {}
      };
    }
    createBiquadFilter() {
      return { type: 'lowpass', frequency: { value: 0 }, connect() { return this; } };
    }
  };
  class FakeAudio {
    constructor(src) {
      this.src = src;
      this.volume = 1;
      this.loop = false;
      this.duration = src.includes('KillingSpree') ? 0.02 : 10;
    }
    play() {
      played.push(this.src);
      return Promise.resolve();
    }
    pause() {}
  }

  const announcer = await loadAnnouncer({ Audio: FakeAudio, AudioContext: CountingAudioContext });
  announcer.unlock();
  announcer.configure({
    transmission: { src: '/sound/transmission.mp3', leadMs: 1 },
    samples: { killing_spree: '/sound/KillingSpree.mp3' }
  });
  announcer.enqueue({
    kind: 'tier',
    count: 4,
    title: 'KILLING SPREE',
    line: 'KILLING SPREE, By Alpet on KFC'
  });

  await wait(60);

  assert.strictEqual(generatedStarts, 0);
  assert.deepStrictEqual(played.slice(0, 2), ['/sound/transmission.mp3', '/sound/KillingSpree.mp3']);
});

test('announcement plays Fish TTS audio for the custom message after local sounds', async () => {
  const played = [];
  class FakeAudio {
    constructor(src) {
      this.src = src;
      this.volume = 1;
      this.loop = false;
      this.duration = src.includes('DoubleKill') ? 0.02 : 10;
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

test('solved announcements without a mapped sample still speak the full line', async () => {
  const played = [];
  class FakeAudio {
    constructor(src) {
      this.src = src;
      this.volume = 1;
      this.loop = false;
      this.duration = src.startsWith('/api/tts') ? 0.02 : 10;
    }
    play() {
      played.push(this.src);
      setTimeout(() => { if (this.onended) this.onended(); }, 0);
      return Promise.resolve();
    }
    pause() {}
  }

  const announcer = await loadAnnouncer({ Audio: FakeAudio });
  announcer.configure({
    transmission: { src: '/sound/transmission.mp3', leadMs: 1 },
    tts: { enabled: true, volume: 1 }
  });
  announcer.enqueue({
    kind: 'tier',
    count: 1,
    title: 'SOLVED',
    line: 'SOLVED, By Alpet on KFC'
  });

  await new Promise(resolve => setTimeout(resolve, 780));

  assert.strictEqual(played[0], '/sound/transmission.mp3');
  assert.match(played[1], /^\/api\/tts\?/);
  assert.strictEqual(new URLSearchParams(played[1].split('?')[1]).get('text'), 'SOLVED, By Alpet on KFC');
});

test('queued announcements wait 2 seconds before the next event starts', async () => {
  const played = [];
  class FakeAudio {
    constructor(src) {
      this.src = src;
      this.volume = 1;
      this.loop = false;
      this.duration = src.startsWith('/api/tts') ? 0.02 : 10;
    }
    play() {
      played.push(this.src);
      if (this.src.startsWith('/api/tts')) setTimeout(() => { if (this.onended) this.onended(); }, 0);
      return Promise.resolve();
    }
    pause() {}
  }

  const announcer = await loadAnnouncer({ Audio: FakeAudio });
  announcer.configure({
    transmission: { src: '/sound/transmission.mp3', leadMs: 1 },
    tts: { enabled: true, volume: 1 }
  });
  announcer.enqueue({
    kind: 'new_ticket',
    title: 'NEW TICKET',
    line: 'NEW TICKET, By Alpet on KFC'
  });
  announcer.enqueue({
    kind: 'new_ticket',
    title: 'NEW TICKET',
    line: 'NEW TICKET, By Bajram on KFC'
  });

  await wait(1900);
  assert.strictEqual(played.filter(src => src === '/sound/transmission.mp3').length, 1);

  await wait(700);
  assert.strictEqual(played.filter(src => src === '/sound/transmission.mp3').length, 2);
});
