'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { createArenaState } = require('../lib/server/services/arenaState');
const { createSseHub } = require('../lib/server/services/sseHub');

const CONFIG = {
  timezone: 'UTC',
  agents: ['Alpet', 'Bajram'],
  services: ['KFC'],
  announcer: { tts: { enabled: false } },
  announcements: {}
};

const silentLogger = { log() {} };

function memoryStore(events = []) {
  return { todayEvents: () => events, append() {}, clear() {} };
}

test('arenaState rebuilds today from the store on construction', () => {
  const events = [
    { id: 'e1', type: 'ticket.created', agent: 'Alpet', service: 'KFC', ticketId: 'T-1', ts: 1 },
    { id: 'e2', type: 'ticket.resolved', agent: 'Alpet', service: 'KFC', ticketId: 'T-1', ts: 2 }
  ];
  const arena = createArenaState({
    config: CONFIG, store: memoryStore(events), now: () => 1000, logger: silentLogger, onDayRoll() {}
  });

  const snap = arena.snapshot();
  assert.strictEqual(snap.state.leaderboard[0].agent, 'Alpet');
  assert.strictEqual(snap.state.leaderboard[0].solved, 1);
  assert.strictEqual(snap.state.firstBlood.agent, 'Alpet');
});

test('snapshot exposes day, public state, config, and merges extras', () => {
  const arena = createArenaState({
    config: CONFIG, store: memoryStore(), now: () => Date.UTC(2026, 6, 10), logger: silentLogger, onDayRoll() {}
  });

  const snap = arena.snapshot({ dayRolled: true });
  assert.strictEqual(snap.day, '2026-07-10');
  assert.deepStrictEqual(snap.config.agents, ['Alpet', 'Bajram']);
  assert.deepStrictEqual(snap.announcements, []);
  assert.strictEqual(snap.dayRolled, true);
});

test('ensureCurrentDay resets the board and notifies once when the day changes', () => {
  let clock = Date.UTC(2026, 6, 10, 12);
  const rolls = [];
  const arena = createArenaState({
    config: CONFIG, store: memoryStore(), now: () => clock, logger: silentLogger,
    onDayRoll: snap => rolls.push(snap.day)
  });

  assert.strictEqual(arena.ensureCurrentDay(), false);
  assert.strictEqual(rolls.length, 0);

  clock = Date.UTC(2026, 6, 11, 12);
  assert.strictEqual(arena.ensureCurrentDay(), true);
  assert.deepStrictEqual(rolls, ['2026-07-11']);

  assert.strictEqual(arena.ensureCurrentDay(), false);
  assert.strictEqual(rolls.length, 1);
});

test('ensureCurrentDay with notify:false rolls silently', () => {
  let clock = Date.UTC(2026, 6, 10, 12);
  const rolls = [];
  const arena = createArenaState({
    config: CONFIG, store: memoryStore(), now: () => clock, logger: silentLogger,
    onDayRoll: snap => rolls.push(snap.day)
  });

  clock = Date.UTC(2026, 6, 11, 12);
  assert.strictEqual(arena.ensureCurrentDay({ notify: false }), true);
  assert.strictEqual(rolls.length, 0);
});

test('applyEvent accepts a new resolve and returns its announcements', () => {
  const arena = createArenaState({
    config: CONFIG, store: memoryStore(), now: () => 1000, logger: silentLogger, onDayRoll() {}
  });

  const event = { id: 'e1', type: 'ticket.resolved', agent: 'Alpet', service: 'KFC', ticketId: 'T-9', ts: 1 };
  const first = arena.applyEvent(event);
  assert.strictEqual(first.accepted, true);
  assert.strictEqual(first.announcements[0].title, 'SOLVED');

  const duplicate = arena.applyEvent(event);
  assert.strictEqual(duplicate.accepted, false);
});

test('reset clears the board without changing the day', () => {
  const arena = createArenaState({
    config: CONFIG, store: memoryStore(), now: () => Date.UTC(2026, 6, 10), logger: silentLogger, onDayRoll() {}
  });

  arena.applyEvent({ id: 'e1', type: 'ticket.resolved', agent: 'Alpet', service: 'KFC', ticketId: 'T-1', ts: 1 });
  assert.strictEqual(arena.snapshot().state.leaderboard[0].solved, 1);

  arena.reset();
  assert.strictEqual(arena.snapshot().state.leaderboard[0].solved, 0);
  assert.strictEqual(arena.snapshot().day, '2026-07-10');
});

test('sseHub broadcasts a framed payload to every client and drops closed ones', () => {
  const hub = createSseHub();
  const written = [];
  const client = { write: frame => written.push(frame) };

  hub.add(client);
  hub.broadcast({ day: '2026-07-10' });
  assert.deepStrictEqual(written, ['data: {"day":"2026-07-10"}\n\n']);

  hub.remove(client);
  hub.broadcast({ day: 'x' });
  assert.strictEqual(written.length, 1);
});
