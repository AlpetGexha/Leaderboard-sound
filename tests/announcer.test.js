'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadAnnouncer(overrides = {}) {
  const elements = new Map();
  const element = () => ({
    textContent: '',
    classList: { add() {}, remove() {}, toggle() {} }
  });
  const context = {
    console,
    setTimeout,
    clearTimeout,
    window: {},
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
      }
    },
    ...overrides
  };
  context.window.AudioContext = class {
    resume() {}
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'announcer.js'), 'utf8');
  vm.runInContext(source, context);
  return context.window.Announcer;
}

test('unlock does not throw when speech synthesis is unavailable', () => {
  const announcer = loadAnnouncer();
  assert.doesNotThrow(() => announcer.unlock());
});

test('unlock starts configured transmission bed after user gesture', () => {
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

  const announcer = loadAnnouncer({ Audio: FakeAudio });
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

  const announcer = loadAnnouncer({ Audio: FakeAudio });
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
