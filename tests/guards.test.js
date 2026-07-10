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

test('dedupe guard trims to the newest 100 once it passes 200 entries', async () => {
  const { createDedupeGuard } = await import('../src/guards/announcementGuards.js');
  const isDuplicate = createDedupeGuard();
  for (let i = 0; i < 201; i++) isDuplicate({ announcementId: `id-${i}` });
  // id-0 was evicted by the trim, so it now reads as new again.
  assert.strictEqual(isDuplicate({ announcementId: 'id-0' }), false);
  // id-200 is inside the retained window.
  assert.strictEqual(isDuplicate({ announcementId: 'id-200' }), true);
});

test('isBigAnnouncement selects the fullscreen overlay', async () => {
  const { isBigAnnouncement } = await import('../src/guards/announcementGuards.js');
  assert.strictEqual(isBigAnnouncement({ kind: 'first_blood' }), true);
  assert.strictEqual(isBigAnnouncement({ kind: 'tier', count: 2 }), true);
  assert.strictEqual(isBigAnnouncement({ kind: 'tier', count: 1 }), false);
  assert.strictEqual(isBigAnnouncement({ kind: 'new_ticket' }), false);
  assert.strictEqual(isBigAnnouncement(null), false);
});

test('canSpeak requires tts enabled and non-empty text', async () => {
  const { canSpeak } = await import('../src/guards/announcementGuards.js');
  assert.strictEqual(canSpeak({ tts: { enabled: true } }, 'hi'), true);
  assert.strictEqual(canSpeak({ tts: { enabled: true } }, ''), false);
  assert.strictEqual(canSpeak({ tts: { enabled: false } }, 'hi'), false);
  assert.strictEqual(canSpeak({}, 'hi'), false);
});
