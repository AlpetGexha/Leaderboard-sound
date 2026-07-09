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
