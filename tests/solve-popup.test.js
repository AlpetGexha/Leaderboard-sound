'use strict';
require('../src/test/setup');
const { test, afterEach } = require('node:test');
const assert = require('node:assert');
const React = require('react');
const { render, screen, cleanup } = require('@testing-library/react');

afterEach(cleanup);

test('normal solve popup identifies the solver and ticket', async () => {
  const { SolvePopup } = await import('../src/components/SolvePopup.jsx');
  render(React.createElement(SolvePopup, {
    announcement: { agent: 'Ermira', service: 'KFC', ticketId: 'T-1042' }
  }));

  assert.ok(screen.getByText('TICKET SECURED'));
  assert.ok(screen.getByText('Ermira'));
  assert.ok(screen.getByText('KFC'));
  assert.ok(screen.getByText('T-1042'));
});
