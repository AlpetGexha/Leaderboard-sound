'use strict';
require('../src/test/setup');
const { test } = require('node:test');
const assert = require('node:assert');

test('announcementId prefers announcementId, else composes a fallback key', async () => {
  const { announcementId } = await import('../src/guards/announcementGuards.js');
  assert.strictEqual(announcementId({ announcementId: 'evt-1:tier:2' }), 'evt-1:tier:2');
  assert.strictEqual(announcementId({ kind: 'new_ticket', ticketId: 'T-1', ts: 5 }), 'new_ticket:T-1:5');
  assert.strictEqual(announcementId({ kind: 'tier', line: 'L' }), 'tier:L:');
});

test('dedupe guard reports the first sighting as new and repeats as duplicate', async () => {
  const { createDedupeGuard } = await import('../src/guards/announcementGuards.js');
  const isDuplicate = createDedupeGuard();
  const a = { announcementId: 'x' };
  assert.strictEqual(isDuplicate(a), false);
  assert.strictEqual(isDuplicate(a), true);
});

test('dedupe guard pins the cap to 200 entries and trims to the newest 100', async () => {
  const { createDedupeGuard } = await import('../src/guards/announcementGuards.js');

  // NOTE: isDuplicate MUTATES the guard's set. Probing an id that is NOT present
  // re-inserts it (and could itself push size past the cap and trigger a trim);
  // probing an id that IS present is a pure read. Each probe below is ordered so
  // it cannot corrupt a later assertion.

  // --- Pin `max` at 200: exactly 200 entries must NOT have triggered a trim yet. ---
  const atCap = createDedupeGuard();
  for (let i = 0; i < 200; i++) atCap({ announcementId: `id-${i}` }); // size === 200, not > 200
  // No trim has happened, so the very first id is still retained.
  // (Fails for any max < 200, where id-0 would already have been evicted.)
  assert.strictEqual(atCap({ announcementId: 'id-0' }), true);

  // --- Pin `keep` at 100: the 201st entry triggers a trim to the newest 100. ---
  const overCap = createDedupeGuard();
  for (let i = 0; i < 201; i++) overCap({ announcementId: `id-${i}` });
  // The trim retained id-101..id-200 (the last 100 entries).
  // id-100 was evicted -> reads NEW. (Fails for any keep > 100.)
  // This probe re-inserts id-100, but that cannot revive id-101, so what follows is safe.
  assert.strictEqual(overCap({ announcementId: 'id-100' }), false);
  // id-101 is the oldest retained entry -> still a DUPLICATE. (Fails for any keep < 100.)
  assert.strictEqual(overCap({ announcementId: 'id-101' }), true);
  // id-200 is the newest entry -> DUPLICATE.
  assert.strictEqual(overCap({ announcementId: 'id-200' }), true);
  // id-0 was evicted long ago -> reads NEW again.
  assert.strictEqual(overCap({ announcementId: 'id-0' }), false);
});

test('isBigAnnouncement selects the fullscreen overlay', async () => {
  const { isBigAnnouncement } = await import('../src/guards/announcementGuards.js');
  assert.strictEqual(isBigAnnouncement({ kind: 'first_blood' }), true);
  assert.strictEqual(isBigAnnouncement({ kind: 'first_blood_boss_defeated' }), true);
  assert.strictEqual(isBigAnnouncement({ kind: 'resolve_highlight' }), true);
  assert.strictEqual(isBigAnnouncement({ kind: 'tier', count: 2 }), true);
  assert.strictEqual(isBigAnnouncement({ kind: 'tier', count: 1 }), false);
  assert.strictEqual(isBigAnnouncement({ kind: 'new_ticket' }), false);
  assert.strictEqual(isBigAnnouncement({ kind: 'urgent_boss_arrival' }), true);
  assert.strictEqual(isBigAnnouncement({ kind: 'urgent_boss_spawned' }), true);
  assert.strictEqual(isBigAnnouncement({ kind: 'urgent_boss_defeated' }), true);
  assert.strictEqual(isBigAnnouncement({ kind: 'team_combo', count: 3 }), true);
  assert.strictEqual(isBigAnnouncement(null), false);
});

test('isSolveAnnouncement selects only the first resolved-ticket tier', async () => {
  const { isSolveAnnouncement } = await import('../src/guards/announcementGuards.js');
  assert.strictEqual(isSolveAnnouncement({ kind: 'tier', count: 1 }), true);
  assert.strictEqual(isSolveAnnouncement({ kind: 'tier', count: 2 }), false);
  assert.strictEqual(isSolveAnnouncement({ kind: 'new_ticket' }), false);
});

test('isMonsterKillAnnouncement detects normal and combined Monster Kill announcements', async () => {
  const { isMonsterKillAnnouncement } = await import('../src/guards/announcementGuards.js');
  assert.strictEqual(isMonsterKillAnnouncement({ kind: 'tier', count: 15 }), true);
  assert.strictEqual(isMonsterKillAnnouncement({ kind: 'resolve_highlight', sampleKind: 'tier', sampleCount: 15 }), true);
  assert.strictEqual(isMonsterKillAnnouncement({ kind: 'tier', count: 10 }), false);
});

test('canSpeak requires tts enabled and non-empty text', async () => {
  const { canSpeak } = await import('../src/guards/announcementGuards.js');
  assert.strictEqual(canSpeak({ tts: { enabled: true } }, 'hi'), true);
  assert.strictEqual(canSpeak({ tts: { enabled: true } }, ''), false);
  assert.strictEqual(canSpeak({ tts: { enabled: false } }, 'hi'), false);
  assert.strictEqual(canSpeak({}, 'hi'), false);
});

test('isUrgentDefeat fires only for urgent monster_defeated effects', async () => {
  const { isUrgentDefeat } = await import('../src/guards/fxGuards.js');
  assert.strictEqual(isUrgentDefeat({ type: 'monster_defeated', priority: 'urgent' }), true);
  assert.strictEqual(isUrgentDefeat({ type: 'monster_defeated', priority: 'medium' }), false);
  assert.strictEqual(isUrgentDefeat({ type: 'monster_defeated' }), false);
  assert.strictEqual(isUrgentDefeat({ type: 'monster_spawned', priority: 'urgent' }), false);
  assert.strictEqual(isUrgentDefeat(null), false);
});
