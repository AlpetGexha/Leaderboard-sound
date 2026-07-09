'use strict';
require('../src/test/setup');
const { test, afterEach } = require('node:test');
const assert = require('node:assert');
const React = require('react');
const { render, screen, waitFor, fireEvent, cleanup } = require('@testing-library/react');

const DEFAULT_SNAPSHOT = {
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
};

afterEach(() => {
  cleanup();
  global.__resetBrowserMocks();
});

async function renderApp(snapshot = DEFAULT_SNAPSHOT, overrides = {}) {
  const { default: App } = await import('../src/App.jsx');
  global.fetch = overrides.fetch || function (url) {
    if (url === '/api/state') return Promise.resolve({ json: () => Promise.resolve(snapshot) });
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('ok') });
  };
  render(React.createElement(App));
}

test('renders the snapshot leaderboard and fallback test panel options', async () => {
  await renderApp();

  assert.ok(await screen.findByText('Alpet'));
  assert.ok(screen.getByText('Bajram'));
  assert.ok(screen.getByText('CLICK TO ARM SPEAKERS'));

  fireEvent.keyDown(document, { key: 'T' });

  assert.ok(await screen.findByRole('option', { name: 'KFC' }));
  assert.ok(screen.getByRole('button', { name: '+ ticket', exact: false }));
  assert.ok(screen.getByRole('button', { name: 'resolve', exact: false }));
});

test('test panel retries once with default secret after a stale saved secret is rejected', async () => {
  const calls = [];
  const removed = [];
  window.localStorage.setItem('arena-secret', 'old-secret');
  const originalRemoveItem = window.localStorage.removeItem.bind(window.localStorage);
  window.localStorage.removeItem = key => {
    removed.push(key);
    originalRemoveItem(key);
  };

  await renderApp(DEFAULT_SNAPSHOT, {
    fetch(url, options) {
      if (url === '/api/state') return Promise.resolve({ json: () => Promise.resolve(DEFAULT_SNAPSHOT) });
      calls.push({ url, options });
      return Promise.resolve(calls.length === 1
        ? { status: 401, ok: false, text: () => Promise.resolve('bad secret') }
        : { status: 200, ok: true, text: () => Promise.resolve('ok') });
    }
  });

  await screen.findByText('Alpet');
  fireEvent.keyDown(document, { key: 'T' });
  fireEvent.click(screen.getByRole('button', { name: '+ ticket', exact: false }));

  await waitFor(() => assert.strictEqual(calls.length, 2));
  assert.strictEqual(calls[0].options.headers['X-Webhook-Secret'], 'old-secret');
  assert.strictEqual(calls[1].options.headers['X-Webhook-Secret'], 'arena-dev-secret');
  assert.deepStrictEqual(removed, ['arena-secret']);
});
