'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function element() {
  return {
    innerHTML: '',
    textContent: '',
    value: '',
    dataset: {},
    children: [],
    classList: { add() {}, remove() {}, toggle() {} },
    listeners: {},
    addEventListener(type, fn) { this.listeners[type] = fn; },
    getBoundingClientRect() { return { top: 0 }; }
  };
}

function loadApp(snapshot, overrides = {}) {
  const elements = new Map();
  const byId = id => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };

  const context = {
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame(fn) { fn(); },
    location: { search: '' },
    URLSearchParams,
    Date,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {}, ...(overrides.localStorage || {}) },
    Announcer: { configure() {}, unlock() {}, enqueue() {} },
    EventSource: class {
      constructor() {}
    },
    fetch: overrides.fetch || function () {
      return Promise.resolve({ json: () => Promise.resolve(snapshot) });
    },
    alert: overrides.alert || function () {},
    document: {
      activeElement: { tagName: 'BODY' },
      getElementById: byId,
      addEventListener() {}
    }
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');
  vm.runInContext(source, context);
  return { elements };
}

test('test panel populates from leaderboard when snapshot config is missing', async () => {
  const { elements } = loadApp({
    day: '2026-07-09',
    state: {
      leaderboard: [
        { rank: 1, agent: 'Alpet', solved: 0, streak: false },
        { rank: 2, agent: 'Bajram', solved: 0, streak: false }
      ],
      firstBlood: null,
      feed: []
    },
    announcements: []
  });

  await new Promise(resolve => setTimeout(resolve, 0));

  assert.match(elements.get('test-agent-grid').innerHTML, /Alpet/);
  assert.match(elements.get('test-agent-grid').innerHTML, /Bajram/);
  assert.match(elements.get('test-service').innerHTML, /KFC/);
});

test('test panel retries once with default secret after a stale saved secret is rejected', async () => {
  const calls = [];
  const removed = [];
  const snapshot = {
    day: '2026-07-09',
    state: {
      leaderboard: [{ rank: 1, agent: 'Alpet', solved: 0, streak: false }],
      firstBlood: null,
      feed: []
    },
    announcements: []
  };
  const { elements } = loadApp(snapshot, {
    localStorage: {
      getItem(key) { return key === 'arena-secret' ? 'old-secret' : null; },
      removeItem(key) { removed.push(key); },
      setItem() {}
    },
    fetch(url, options) {
      if (url === '/api/state') return Promise.resolve({ json: () => Promise.resolve(snapshot) });
      calls.push({ url, options });
      return Promise.resolve(calls.length === 1
        ? { status: 401, ok: false, text: () => Promise.resolve('bad secret') }
        : { status: 200, ok: true, text: () => Promise.resolve('ok') });
    },
    alert() {}
  });

  await new Promise(resolve => setTimeout(resolve, 0));
  elements.get('test-service').value = 'KFC';
  await elements.get('test-agent-grid').listeners.click({
    target: {
      closest() {
        return { dataset: { type: 'ticket.created', agent: 'Alpet' } };
      }
    }
  });
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[0].options.headers['X-Webhook-Secret'], 'old-secret');
  assert.strictEqual(calls[1].options.headers['X-Webhook-Secret'], 'arena-dev-secret');
  assert.deepStrictEqual(removed, ['arena-secret']);
});
