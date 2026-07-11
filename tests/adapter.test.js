'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { parseWebhook } = require('../lib/adapter');

const AGENTS = ['Alpet', 'Bajram', 'Kushtrim', 'Mirlind', 'Ermira'];

test('valid payload produces a stamped internal event', () => {
  const r = parseWebhook({ type: 'ticket.created', agent: 'Ermira', service: 'Billing', ticketId: 'T-1' }, AGENTS);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.event.agent, 'Ermira');
  assert.strictEqual(r.event.service, 'Billing');
  assert.ok(r.event.id.length > 10);
  assert.ok(Math.abs(r.event.ts - Date.now()) < 2000);
});

test('agent matching is case-insensitive but canonicalized', () => {
  const r = parseWebhook({ type: 'ticket.resolved', agent: 'kushtrim', ticketId: 'T-2' }, AGENTS);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.event.agent, 'Kushtrim');
});

test('missing service defaults to General', () => {
  const r = parseWebhook({ type: 'ticket.created', agent: 'Alpet', ticketId: 'T-3' }, AGENTS);
  assert.strictEqual(r.event.service, 'General');
  assert.strictEqual(r.event.priority, 'medium');
});

test('normalizes priority and accepts status as an alias', () => {
  const urgent = parseWebhook({ type: 'ticket.created', agent: 'Alpet', ticketId: 'P-1', priority: ' URGENT ' }, AGENTS);
  const low = parseWebhook({ type: 'ticket.created', agent: 'Alpet', ticketId: 'P-2', status: 'Low' }, AGENTS);
  const unknown = parseWebhook({ type: 'ticket.created', agent: 'Alpet', ticketId: 'P-3', priority: 'critical' }, AGENTS);
  assert.strictEqual(urgent.event.priority, 'urgent');
  assert.strictEqual(low.event.priority, 'low');
  assert.strictEqual(unknown.event.priority, 'medium');
});

test('rejects unknown type, unknown agent, missing ticketId, non-object body', () => {
  assert.strictEqual(parseWebhook({ type: 'nope', agent: 'Alpet', ticketId: 'T' }, AGENTS).ok, false);
  assert.strictEqual(parseWebhook({ type: 'ticket.created', agent: 'Mallory', ticketId: 'T' }, AGENTS).ok, false);
  assert.strictEqual(parseWebhook({ type: 'ticket.created', agent: 'Alpet' }, AGENTS).ok, false);
  assert.strictEqual(parseWebhook(null, AGENTS).ok, false);
  assert.strictEqual(parseWebhook('string', AGENTS).ok, false);
});

test('coerces numeric ticketId to string and trims whitespace', () => {
  const r = parseWebhook({ type: 'ticket.created', agent: 'Alpet', ticketId: 1042, service: '  Email ' }, AGENTS);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.event.ticketId, '1042');
  assert.strictEqual(r.event.service, 'Email');
});
