'use strict';
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost:3000/'
});

global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', {
  value: dom.window.navigator,
  configurable: true
});
global.HTMLElement = dom.window.HTMLElement;
global.Event = dom.window.Event;
global.KeyboardEvent = dom.window.KeyboardEvent;
global.MouseEvent = dom.window.MouseEvent;
global.URLSearchParams = dom.window.URLSearchParams;
global.localStorage = dom.window.localStorage;
global.requestAnimationFrame = fn => setTimeout(fn, 0);
global.cancelAnimationFrame = id => clearTimeout(id);
global.alert = () => {};

class MockEventSource {
  constructor(url) {
    this.url = url;
    MockEventSource.instances.push(this);
    setTimeout(() => {
      if (this.onopen) this.onopen();
    }, 0);
  }
  close() {
    this.closed = true;
  }
}
MockEventSource.instances = [];

class MockAudio {
  constructor(src) {
    this.src = src;
    this.volume = 1;
    this.loop = false;
  }
  play() {
    setTimeout(() => {
      if (this.onended) this.onended();
    }, 0);
    return Promise.resolve();
  }
  pause() {}
}

class MockAudioContext {
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
}

global.EventSource = MockEventSource;
global.Audio = MockAudio;
global.AudioContext = MockAudioContext;
global.window.EventSource = MockEventSource;
global.window.Audio = MockAudio;
global.window.AudioContext = MockAudioContext;
global.window.webkitAudioContext = MockAudioContext;
global.window.speechSynthesis = {
  speak() {},
  getVoices() { return []; }
};
global.window.SpeechSynthesisUtterance = class {
  constructor(text) {
    this.text = text;
  }
};

global.__resetBrowserMocks = function () {
  MockEventSource.instances.length = 0;
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
  delete global.fetch;
};
