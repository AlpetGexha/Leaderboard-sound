'use strict';
require('../src/test/setup');
const { test, afterEach } = require('node:test');
const assert = require('node:assert');
const React = require('react');
const { render, screen, cleanup } = require('@testing-library/react');

afterEach(cleanup);

test('priority categories select distinct monster identities', async () => {
  const { monsterFor } = await import('../src/components/InboxInvasion.jsx');
  const identities = ['low', 'medium', 'high', 'urgent'].map(priority => monsterFor('KFC', priority));
  assert.deepStrictEqual(identities.map(item => item.title), [
    'Tiny Queue Slime', 'Inbox Goblin', 'Escalation Demon', 'SLA Apocalypse'
  ]);
  assert.strictEqual(new Set(identities.map(item => item.emoji)).size, 4);
});

test('renders the ticket priority on its monster card', async () => {
  const { InboxInvasion } = await import('../src/components/InboxInvasion.jsx');
  render(React.createElement(InboxInvasion, {
    invasion: { activeCount: 1, enemies: [{ ticketId: 'URG-9', service: 'KFC', agent: 'Ermira', priority: 'urgent', ts: 1 }] },
    effects: []
  }));
  assert.ok(screen.getByText('SLA Apocalypse'));
  assert.ok(screen.getByText('urgent'));
  assert.ok(screen.getByText('URG-9'));
});
