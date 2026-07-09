'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../lib/store');
const { createArenaServer } = require('../lib/http-server');

const quietLogger = { log() {} };

function tmpFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'arena-server-')), 'events.jsonl');
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'arena-server-'));
}

function listen(server) {
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
}

test('webhooks after midnight are applied to the new day immediately', async () => {
  let now = Date.UTC(2026, 0, 1, 23, 59, 50);
  const config = {
    timezone: 'UTC',
    webhookSecret: 'secret',
    agents: ['Alpet', 'Bajram'],
    services: ['Billing']
  };
  const store = createStore(tmpFile(), config.timezone);
  const { server } = createArenaServer({ config, store, now: () => now, logger: quietLogger });
  const base = await listen(server);

  try {
    now = Date.UTC(2026, 0, 2, 0, 0, 5);
    const posted = await fetch(`${base}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': 'secret' },
      body: JSON.stringify({ type: 'ticket.resolved', agent: 'Alpet', service: 'Billing', ticketId: 'T-1' })
    });
    assert.strictEqual(posted.status, 200);

    const snapshot = await fetch(`${base}/api/state`).then(r => r.json());
    assert.strictEqual(snapshot.day, '2026-01-02');
    assert.strictEqual(snapshot.state.leaderboard.find(r => r.agent === 'Alpet').solved, 1);
  } finally {
    await close(server);
  }
});

test('state exposes configured agents and services for the browser test panel', async () => {
  const config = {
    timezone: 'UTC',
    webhookSecret: 'secret',
    agents: ['One', 'Two'],
    services: ['Billing', 'VPN']
  };
  const store = createStore(tmpFile(), config.timezone);
  const { server } = createArenaServer({ config, store, now: () => Date.UTC(2026, 0, 2), logger: quietLogger });
  const base = await listen(server);

  try {
    const snapshot = await fetch(`${base}/api/state`).then(r => r.json());
    assert.deepStrictEqual(snapshot.config.agents, ['One', 'Two']);
    assert.deepStrictEqual(snapshot.config.services, ['Billing', 'VPN']);
  } finally {
    await close(server);
  }
});

test('state exposes announcer config for browser sound customization', async () => {
  const config = {
    timezone: 'UTC',
    webhookSecret: 'secret',
    agents: ['One'],
    services: ['CTF'],
    announcer: {
      voice: { rate: 0.8, pitch: 0.35 },
      background: { src: '/sound/transmission.mp3', volume: 0.25, loop: true },
      samples: { first_blood: '/sound/First%20Blood.mp3' }
    }
  };
  const store = createStore(tmpFile(), config.timezone);
  const { server } = createArenaServer({ config, store, now: () => Date.UTC(2026, 0, 2), logger: quietLogger });
  const base = await listen(server);

  try {
    const snapshot = await fetch(`${base}/api/state`).then(r => r.json());
    assert.deepStrictEqual(snapshot.config.announcer, config.announcer);
  } finally {
    await close(server);
  }
});

test('serves local sound assets from the configured sound directory', async () => {
  const soundDir = tmpDir();
  fs.writeFileSync(path.join(soundDir, 'transmission.mp3'), Buffer.from([0x49, 0x44, 0x33]));
  const config = {
    timezone: 'UTC',
    webhookSecret: 'secret',
    agents: ['One'],
    services: ['CTF']
  };
  const store = createStore(tmpFile(), config.timezone);
  const { server } = createArenaServer({
    config,
    store,
    soundDir,
    now: () => Date.UTC(2026, 0, 2),
    logger: quietLogger
  });
  const base = await listen(server);

  try {
    const res = await fetch(`${base}/sound/transmission.mp3`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'audio/mpeg');
    assert.deepStrictEqual([...new Uint8Array(await res.arrayBuffer())], [0x49, 0x44, 0x33]);
  } finally {
    await close(server);
  }
});
