'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { createArenaState, configuredMinutes } = require('../lib/server/services/arenaState');
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

test('broadcast survives a client whose write throws and still reaches the others', () => {
  const hub = createSseHub();
  const good = [];
  // The dead client is added first, so it is iterated first: a thrown write
  // must not abort delivery to goodClient behind it.
  const deadClient = { write: () => { throw new Error('ERR_STREAM_DESTROYED'); } };
  const goodClient = { write: frame => good.push(frame) };
  hub.add(deadClient);
  hub.add(goodClient);

  assert.doesNotThrow(() => hub.broadcast({ day: 'x' }));
  assert.deepStrictEqual(good, ['data: {"day":"x"}\n\n']);
  assert.strictEqual(hub.size, 1, 'the failed client should have been dropped');

  hub.broadcast({ day: 'y' });
  assert.strictEqual(good.length, 2);
});

test('feature flags default true and explicit false is exposed', () => {
  const defaults = createArenaState({ config: CONFIG, store: memoryStore(), now: () => 0, logger: silentLogger });
  assert.deepStrictEqual(defaults.snapshot().config.features, {
    inboxInvasion: true, comebackAnnouncements: true, endOfDayAwards: true
  });
  const config = { ...CONFIG, features: { inboxInvasion: false, comebackAnnouncements: false, endOfDayAwards: false } };
  const off = createArenaState({ config, store: memoryStore(), now: () => 0, logger: silentLogger });
  assert.deepStrictEqual(off.snapshot().config.features, config.features);
  assert.strictEqual(off.snapshot().ceremony, null);
});

test('awards freeze pre-closing events and reconstruct after restart', () => {
  const before = Date.UTC(2026, 6, 11, 16, 59);
  const closing = Date.UTC(2026, 6, 11, 17, 0);
  const events = [
    { id: 'e1', type: 'ticket.created', agent: 'Alpet', service: 'KFC', ticketId: 'T1', ts: before - 1000 },
    { id: 'e2', type: 'ticket.resolved', agent: 'Alpet', service: 'KFC', ticketId: 'T1', ts: before },
    { id: 'e3', type: 'ticket.resolved', agent: 'Bajram', service: 'KFC', ticketId: 'T2', ts: closing + 1000 }
  ];
  const config = { ...CONFIG, featureSettings: { awardsTime: '17:00' } };
  const arena = createArenaState({ config, store: memoryStore(events), now: () => closing, logger: silentLogger });
  const ceremony = arena.snapshot().ceremony;
  assert.strictEqual(ceremony.id, 'awards:2026-07-11');
  assert.strictEqual(ceremony.awards.find(item => item.key === 'mvp').winner, 'Alpet');
  assert.strictEqual(arena.snapshot().state.leaderboard.find(item => item.agent === 'Bajram').solved, 1);
  assert.strictEqual(arena.ensureCeremony(), false, 'a ceremony is created once per day');
});

test('invalid awards times fall back to 17:00', () => {
  assert.strictEqual(configuredMinutes('17:00'), 17 * 60);
  assert.strictEqual(configuredMinutes('24:00'), 17 * 60);
  assert.strictEqual(configuredMinutes('12:99'), 17 * 60);
  assert.strictEqual(configuredMinutes('not-a-time'), 17 * 60);
});
