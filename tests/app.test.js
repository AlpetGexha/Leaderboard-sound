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
  const appModule = await import('../src/App.jsx');
  const App = appModule.default.default || appModule.default;
  global.fetch = overrides.fetch || function (url) {
    if (url === '/api/state') return Promise.resolve({ json: () => Promise.resolve(snapshot) });
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('ok') });
  };
  render(React.createElement(App));
}

test('renders the snapshot leaderboard and fallback test panel options', async () => {
  await renderApp();

  assert.ok((await screen.findAllByText('Alpet')).length >= 1);
  assert.ok(screen.getAllByText('Bajram').length >= 1);
  fireEvent.click(screen.getByRole('button', { name: 'CLICK TO ARM SPEAKERS' }));

  fireEvent.keyDown(document, { key: 'T' });

  assert.ok(await screen.findByRole('option', { name: 'KFC' }));
  assert.ok(screen.getAllByRole('button', { name: '+ ticket', exact: false }).length >= 1);
  assert.ok(screen.getAllByRole('button', { name: 'resolve', exact: false }).length >= 1);
});

test('test panel retries once with default secret after a stale saved secret is rejected', async () => {
  const calls = [];
  window.localStorage.setItem('arena-secret', 'old-secret');

  await renderApp(DEFAULT_SNAPSHOT, {
    fetch(url, options) {
      if (url === '/api/state') return Promise.resolve({ json: () => Promise.resolve(DEFAULT_SNAPSHOT) });
      calls.push({ url, options });
      return Promise.resolve(calls.length === 1
        ? { status: 401, ok: false, text: () => Promise.resolve('bad secret') }
        : { status: 200, ok: true, text: () => Promise.resolve('ok') });
    }
  });

  await screen.findAllByText('Alpet');
  fireEvent.click(screen.getByRole('button', { name: 'CLICK TO ARM SPEAKERS' }));
  fireEvent.keyDown(document, { key: 'T' });
  fireEvent.click(screen.getAllByRole('button', { name: '+ ticket', exact: false })[0]);

  await waitFor(() => assert.strictEqual(calls.length, 2));
  assert.strictEqual(calls[0].options.headers['X-Webhook-Secret'], 'old-secret');
  assert.strictEqual(calls[1].options.headers['X-Webhook-Secret'], 'arena-dev-secret');
  assert.strictEqual(window.localStorage.getItem('arena-secret'), null);
});

test('duplicate live announcements with the same announcementId are only played once', async () => {
  const snapshot = {
    ...DEFAULT_SNAPSHOT,
    config: {
      agents: ['Alpet', 'Bajram'],
      services: ['KFC'],
      announcer: {
        transmission: { src: '/sound/transmission.mp3', leadMs: 1 },
        tts: { enabled: false }
      }
    }
  };
  const played = [];
  global.Audio = global.window.Audio = class {
    constructor(src) {
      this.src = src;
      this.volume = 1;
      this.loop = false;
    }
    play() {
      played.push(this.src);
      return Promise.resolve();
    }
    pause() {}
    load() {}
  };

  await renderApp(snapshot, {
    fetch(url) {
      if (url === '/api/state') return Promise.resolve({ json: () => Promise.resolve(snapshot) });
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('ok') });
    }
  });

  fireEvent.click(await screen.findByRole('button', { name: 'CLICK TO ARM SPEAKERS' }));

  const payload = {
    ...snapshot,
    announcements: [{
      announcementId: 'evt-1:new_ticket',
      eventId: 'evt-1',
      ticketId: 'T-1',
      ts: 1000,
      kind: 'new_ticket',
      title: 'NEW TICKET',
      line: 'NEW TICKET, By Alpet on KFC'
    }]
  };

  global.EventSource.instances[0].onmessage({ data: JSON.stringify(payload) });
  global.EventSource.instances[0].onmessage({ data: JSON.stringify(payload) });

  await waitFor(() => assert.deepStrictEqual(played, ['/sound/transmission.mp3']));
});

test('a frame that adds a sample mapping alongside its announcement configures before enqueuing', async () => {
  // The initial snapshot maps no samples. The live frame introduces the sample
  // and the announcement together. The announcer must apply the new profile
  // before it dequeues, or createSample reads the stale (empty) samples map and
  // the mapped MP3 never plays.
  const initial = {
    ...DEFAULT_SNAPSHOT,
    config: { agents: ['Alpet', 'Bajram'], services: ['KFC'], announcer: { tts: { enabled: false } } }
  };
  const played = [];
  global.Audio = global.window.Audio = class {
    constructor(src) { this.src = src; this.volume = 1; this.loop = false; this.duration = 0.05; }
    play() { played.push(this.src); return Promise.resolve(); }
    pause() {}
    load() {}
  };

  await renderApp(initial, {
    fetch(url) {
      if (url === '/api/state') return Promise.resolve({ json: () => Promise.resolve(initial) });
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('ok') });
    }
  });

  fireEvent.click(await screen.findByRole('button', { name: 'CLICK TO ARM SPEAKERS' }));

  const frame = {
    ...initial,
    config: {
      agents: ['Alpet', 'Bajram'],
      services: ['KFC'],
      announcer: { samples: { new_ticket: '/sound/new.mp3' }, tts: { enabled: false } }
    },
    announcements: [{
      announcementId: 'evt-9:new_ticket',
      kind: 'new_ticket',
      title: 'NEW TICKET',
      line: 'NEW TICKET, By Alpet on KFC'
    }]
  };

  global.EventSource.instances[0].onmessage({ data: JSON.stringify(frame) });

  await waitFor(() => assert.ok(played.includes('/sound/new.mp3'),
    `expected the mapped sample to play, saw ${JSON.stringify(played)}`), { timeout: 1000 });
});

test('a closing ceremony waits for the audio gate and is stored once it starts', async () => {
  const snapshot = {
    ...DEFAULT_SNAPSHOT,
    config: { agents: ['Alpet', 'Bajram'], services: ['KFC'], announcer: { tts: { enabled: false } } },
    ceremony: {
      id: 'awards:2026-07-09',
      day: '2026-07-09',
      awards: [{ key: 'mvp', title: 'MVP', winner: 'Alpet', line: 'Alpet is today’s MVP!' }]
    }
  };

  await renderApp(snapshot);
  await screen.findByRole('button', { name: 'CLICK TO ARM SPEAKERS' });
  assert.strictEqual(screen.queryByText('Alpet is today’s MVP!'), null);
  assert.strictEqual(localStorage.getItem('ticket-arena:ceremony:v1:awards:2026-07-09'), null);

  fireEvent.click(screen.getByRole('button', { name: 'CLICK TO ARM SPEAKERS' }));
  assert.ok(await screen.findByText('Alpet is today’s MVP!'));
  assert.strictEqual(localStorage.getItem('ticket-arena:ceremony:v1:awards:2026-07-09'), 'shown');
});

test('inbox invasion is omitted when its independent feature flag is false', async () => {
  const snapshot = {
    ...DEFAULT_SNAPSHOT,
    config: { features: { inboxInvasion: false }, agents: ['Alpet', 'Bajram'], services: ['KFC'] }
  };
  await renderApp(snapshot);
  fireEvent.click(await screen.findByRole('button', { name: 'CLICK TO ARM SPEAKERS' }));
  assert.strictEqual(screen.queryByRole('heading', { name: 'INBOX INVASION' }), null);
});
