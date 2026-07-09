'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../lib/store');

function tmpFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'arena-')), 'events.jsonl');
}

test('append then todayEvents round-trips events from today', () => {
  const store = createStore(tmpFile(), 'Europe/Tirane');
  const now = Date.now();
  store.append({ id: 'e1', type: 'ticket.resolved', agent: 'Alpet', service: 'Email', ticketId: 'T-1', ts: now });
  const events = store.todayEvents(now);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].ticketId, 'T-1');
});

test('todayEvents filters out events from other days', () => {
  const store = createStore(tmpFile(), 'Europe/Tirane');
  const now = Date.now();
  store.append({ id: 'e1', type: 'ticket.resolved', agent: 'Alpet', service: 'Email', ticketId: 'OLD', ts: now - 3 * 86400000 });
  store.append({ id: 'e2', type: 'ticket.resolved', agent: 'Alpet', service: 'Email', ticketId: 'NEW', ts: now });
  const events = store.todayEvents(now);
  assert.deepStrictEqual(events.map(e => e.ticketId), ['NEW']);
});

test('malformed lines are skipped without crashing', () => {
  const file = tmpFile();
  const store = createStore(file, 'Europe/Tirane');
  const now = Date.now();
  store.append({ id: 'e1', type: 'ticket.created', agent: 'Ermira', service: 'VPN', ticketId: 'T-1', ts: now });
  fs.appendFileSync(file, 'NOT JSON{{{\n');
  store.append({ id: 'e2', type: 'ticket.created', agent: 'Ermira', service: 'VPN', ticketId: 'T-2', ts: now });
  assert.strictEqual(store.todayEvents(now).length, 2);
});

test('missing file yields empty list; clear empties the log', () => {
  const store = createStore(tmpFile(), 'Europe/Tirane');
  assert.deepStrictEqual(store.todayEvents(), []);
  store.append({ id: 'e1', type: 'ticket.created', agent: 'Ermira', service: 'VPN', ticketId: 'T-1', ts: Date.now() });
  store.clear();
  assert.deepStrictEqual(store.todayEvents(), []);
});
