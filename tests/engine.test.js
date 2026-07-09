'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { dayKey, createDay, applyEvent, publicState, TIERS } = require('../lib/engine');

const AGENTS = ['Alpet', 'Bajram', 'Kushtrim', 'Mirlind', 'Ermira'];
let seq = 0;
function ev(type, agent, ticketId, ts, service = 'Billing') {
  return { id: `e${++seq}`, type, agent, service, ticketId, ts };
}

test('dayKey formats a calendar date in the given timezone', () => {
  // 2026-07-08 23:30 UTC is 2026-07-09 01:30 in Europe/Tirane (CEST, UTC+2)
  assert.strictEqual(dayKey(Date.UTC(2026, 6, 8, 23, 30), 'Europe/Tirane'), '2026-07-09');
  assert.strictEqual(dayKey(Date.UTC(2026, 6, 8, 23, 30), 'UTC'), '2026-07-08');
});

test('first created ticket of the day is FIRST BLOOD, later ones are new_ticket', () => {
  const s = createDay(AGENTS);
  const r1 = applyEvent(s, ev('ticket.created', 'Ermira', 'T-1', 1000));
  assert.strictEqual(r1.accepted, true);
  assert.strictEqual(r1.announcements[0].kind, 'first_blood');
  assert.match(r1.announcements[0].line, /First blood on Billing by Ermira/i);
  const r2 = applyEvent(s, ev('ticket.created', 'Alpet', 'T-2', 2000));
  assert.strictEqual(r2.announcements[0].kind, 'new_ticket');
  assert.match(r2.announcements[0].line, /New ticket by Alpet/i);
  assert.deepStrictEqual(publicState(s).firstBlood, { agent: 'Ermira', service: 'Billing', ts: 1000 });
});

test('duplicate created ticketId is rejected', () => {
  const s = createDay(AGENTS);
  applyEvent(s, ev('ticket.created', 'Ermira', 'T-1', 1000));
  const dup = applyEvent(s, ev('ticket.created', 'Alpet', 'T-1', 2000));
  assert.strictEqual(dup.accepted, false);
});

test('resolves increment count and fire tier announcements at exact milestones', () => {
  const s = createDay(AGENTS);
  const titles = [];
  for (let i = 1; i <= 15; i++) {
    const r = applyEvent(s, ev('ticket.resolved', 'Kushtrim', `T-${i}`, i * 1000));
    assert.strictEqual(r.accepted, true);
    for (const a of r.announcements) titles.push(`${a.count}:${a.title}`);
  }
  assert.deepStrictEqual(titles, [
    '1:SOLVED', '2:DOUBLE KILL', '3:TRIPLE KILL', '4:KILLING SPREE',
    '5:UNSTOPPABLE', '7:RAMPAGE', '10:GODLIKE', '15:MONSTER KILL'
  ]);
  assert.strictEqual(publicState(s).leaderboard[0].solved, 15);
});

test('a ticketId can only be resolved once (reopens ignored)', () => {
  const s = createDay(AGENTS);
  applyEvent(s, ev('ticket.resolved', 'Bajram', 'T-9', 1000));
  const again = applyEvent(s, ev('ticket.resolved', 'Bajram', 'T-9', 2000));
  assert.strictEqual(again.accepted, false);
  assert.strictEqual(publicState(s).leaderboard.find(r => r.agent === 'Bajram').solved, 1);
});

test('resolve does not require a prior created event', () => {
  const s = createDay(AGENTS);
  const r = applyEvent(s, ev('ticket.resolved', 'Mirlind', 'OLD-1', 1000));
  assert.strictEqual(r.accepted, true);
});

test('unknown agent or type is rejected', () => {
  const s = createDay(AGENTS);
  assert.strictEqual(applyEvent(s, ev('ticket.created', 'Mallory', 'T-1', 1000)).accepted, false);
  assert.strictEqual(applyEvent(s, ev('ticket.deleted', 'Alpet', 'T-2', 1000)).accepted, false);
});

test('tie-break: first to reach the shared count ranks higher', () => {
  const s = createDay(AGENTS);
  applyEvent(s, ev('ticket.resolved', 'Alpet', 'A-1', 1000));
  applyEvent(s, ev('ticket.resolved', 'Alpet', 'A-2', 2000)); // Alpet reaches 2 at t=2000
  applyEvent(s, ev('ticket.resolved', 'Bajram', 'B-1', 1500));
  applyEvent(s, ev('ticket.resolved', 'Bajram', 'B-2', 3000)); // Bajram reaches 2 at t=3000
  const lb = publicState(s).leaderboard;
  assert.strictEqual(lb[0].agent, 'Alpet');
  assert.strictEqual(lb[1].agent, 'Bajram');
  assert.strictEqual(lb[0].rank, 1);
});

test('all agents appear on the board, zeros in config order', () => {
  const s = createDay(AGENTS);
  const lb = publicState(s).leaderboard;
  assert.strictEqual(lb.length, 5);
  assert.deepStrictEqual(lb.map(r => r.agent), AGENTS);
});

test('feed keeps newest first, max 8 entries', () => {
  const s = createDay(AGENTS);
  for (let i = 1; i <= 10; i++) applyEvent(s, ev('ticket.resolved', 'Ermira', `T-${i}`, i * 1000));
  const feed = publicState(s).feed;
  assert.strictEqual(feed.length, 8);
  assert.strictEqual(feed[0].ticketId, 'T-10');
});

test('TIERS is exported for the frontend/test-panel', () => {
  assert.strictEqual(TIERS[2].name, 'DOUBLE KILL');
});
