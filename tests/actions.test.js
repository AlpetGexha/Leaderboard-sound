'use strict';
require('../src/test/setup');
const { test, afterEach } = require('node:test');
const assert = require('node:assert');

afterEach(() => global.__resetBrowserMocks());

test('ticketIds pairs a resolve with the open ticket for that agent', async () => {
  const { createTicketIds } = await import('../src/services/ticketIds.js');
  const ids = createTicketIds(100);

  assert.strictEqual(ids.forCreate('Alpet'), 'T-101');
  assert.strictEqual(ids.forResolve('Alpet'), 'T-101');
  // The open ticket was consumed, so the next resolve mints a fresh id.
  assert.strictEqual(ids.forResolve('Alpet'), 'T-102');
  // A resolve for an agent with no open ticket also mints a fresh id.
  assert.strictEqual(ids.forResolve('Bajram'), 'T-103');
});

test('secretStore reads the fallback, persists writes, and clears on reset', async () => {
  const { createSecretStore } = await import('../src/services/secretStore.js');
  const store = createSecretStore();

  assert.strictEqual(store.get(), 'arena-dev-secret');
  store.set('mine');
  assert.strictEqual(window.localStorage.getItem('arena-secret'), 'mine');
  assert.strictEqual(store.get(), 'mine');

  // reset must removeItem, not overwrite: tests/app.test.js asserts the key is null.
  assert.strictEqual(store.reset(), 'arena-dev-secret');
  assert.strictEqual(window.localStorage.getItem('arena-secret'), null);
});

test('sendTicketEvent retries once with the default secret after a 401', async () => {
  const { sendTicketEvent } = await import('../src/actions/sendTicketEvent.js');
  const { createSecretStore } = await import('../src/services/secretStore.js');

  window.localStorage.setItem('arena-secret', 'stale');
  const secretStore = createSecretStore();
  const sent = [];
  const api = {
    postEvent(payload, secret) {
      sent.push(secret);
      return Promise.resolve(sent.length === 1
        ? { status: 401, ok: false, text: () => Promise.resolve('bad secret') }
        : { status: 200, ok: true, text: () => Promise.resolve('ok') });
    }
  };

  const result = await sendTicketEvent({ api, secretStore }, { type: 'ticket.created' });

  assert.deepStrictEqual(sent, ['stale', 'arena-dev-secret']);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.secret, 'arena-dev-secret');
  assert.strictEqual(window.localStorage.getItem('arena-secret'), null);
});

test('sendTicketEvent notifies and gives up after a second 401', async () => {
  const { sendTicketEvent } = await import('../src/actions/sendTicketEvent.js');
  const { createSecretStore } = await import('../src/services/secretStore.js');

  const notices = [];
  const api = { postEvent: () => Promise.resolve({ status: 401, ok: false, text: () => Promise.resolve('') }) };
  const result = await sendTicketEvent(
    { api, secretStore: createSecretStore(), notify: m => notices.push(m) },
    { type: 'ticket.created' }
  );

  assert.strictEqual(result.ok, false);
  assert.strictEqual(notices.length, 1);
  assert.match(notices[0], /bad webhook secret/);
});

test('createTicket and resolveTicket carry the paired ticket id', async () => {
  const { createTicket } = await import('../src/actions/createTicket.js');
  const { resolveTicket } = await import('../src/actions/resolveTicket.js');
  const { createTicketIds } = await import('../src/services/ticketIds.js');
  const { createSecretStore } = await import('../src/services/secretStore.js');

  const payloads = [];
  const api = {
    postEvent(payload) {
      payloads.push(payload);
      return Promise.resolve({ status: 200, ok: true, text: () => Promise.resolve('ok') });
    }
  };
  const deps = { api, secretStore: createSecretStore(), ticketIds: createTicketIds(0) };

  await createTicket(deps, { agent: 'Alpet', service: 'KFC' });
  await resolveTicket(deps, { agent: 'Alpet', service: 'KFC' });

  assert.deepStrictEqual(payloads, [
    { type: 'ticket.created', agent: 'Alpet', service: 'KFC', ticketId: 'T-1' },
    { type: 'ticket.resolved', agent: 'Alpet', service: 'KFC', ticketId: 'T-1' }
  ]);
});

test('resetDay warns when the server is not in dev mode', async () => {
  const { resetDay } = await import('../src/actions/resetDay.js');
  const notices = [];
  const api = { postDevReset: () => Promise.resolve({ ok: false }) };

  await resetDay({ api, notify: m => notices.push(m) });

  assert.strictEqual(notices.length, 1);
  assert.match(notices[0], /DEV=1/);
});

// The TestPanel calls resetDay({ api }) with no notify, so the default runs in
// production. A native window.alert throws "Illegal invocation" if invoked with
// this !== window, so a bare `notify(msg)` on a detached reference fails in a
// real browser. jsdom's alert is a no-op that skips that check, so we install a
// faithful native alert here to catch the regression the injected tests can't.
function installNativeAlert(shown) {
  const previous = window.alert;
  window.alert = function alert(message) {
    if (this !== window) throw new TypeError('Illegal invocation');
    shown.push(message);
  };
  return () => { window.alert = previous; };
}

test('resetDay shows the default alert without an Illegal invocation in a real browser', async () => {
  const { resetDay } = await import('../src/actions/resetDay.js');
  const shown = [];
  const restore = installNativeAlert(shown);
  try {
    const api = { postDevReset: () => Promise.resolve({ ok: false }) };
    await assert.doesNotReject(resetDay({ api }));
    assert.deepStrictEqual(shown, ['reset only works when server runs with DEV=1']);
  } finally {
    restore();
  }
});

test('sendTicketEvent shows the default alert without an Illegal invocation in a real browser', async () => {
  const { sendTicketEvent } = await import('../src/actions/sendTicketEvent.js');
  const { createSecretStore } = await import('../src/services/secretStore.js');
  const shown = [];
  const restore = installNativeAlert(shown);
  try {
    const api = { postEvent: () => Promise.resolve({ status: 401, ok: false, text: () => Promise.resolve('') }) };
    const result = await sendTicketEvent({ api, secretStore: createSecretStore() }, { type: 'ticket.created' });
    assert.strictEqual(result.ok, false);
    assert.deepStrictEqual(shown, ['Test event rejected: bad webhook secret. The server is not using arena-dev-secret.']);
  } finally {
    restore();
  }
});
