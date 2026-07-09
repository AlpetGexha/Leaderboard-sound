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

