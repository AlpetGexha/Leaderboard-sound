'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { createRouter, matchRoute } = require('../lib/server/router');

function fakeRes() {
  const res = { statusCode: null, headers: null, body: null };
  res.writeHead = (status, headers) => { res.statusCode = status; res.headers = headers; };
  res.end = body => { res.body = body; };
  return res;
}

test('matchRoute honours exact paths, prefixes, method arrays, and catch-alls', () => {
  const url = new URL('http://localhost/api/state');
  assert.strictEqual(matchRoute({ method: 'GET', path: '/api/state' }, 'GET', url), true);
  assert.strictEqual(matchRoute({ method: 'GET', path: '/api/state' }, 'POST', url), false);
  assert.strictEqual(matchRoute({ method: ['GET', 'POST'], path: '/api/state' }, 'POST', url), true);

  const sound = new URL('http://localhost/sound/a.mp3');
  assert.strictEqual(matchRoute({ method: 'GET', prefix: '/sound/' }, 'GET', sound), true);
  assert.strictEqual(matchRoute({ method: 'GET', prefix: '/sound/' }, 'GET', url), false);

  assert.strictEqual(matchRoute({ method: 'GET' }, 'GET', url), true);
});

test('router runs guards in order and short-circuits on the first rejection', async () => {
  const ran = [];
  const routes = [{
    method: 'POST',
    path: '/x',
    guards: [
      async () => { ran.push('g1'); return null; },
      async () => { ran.push('g2'); return { status: 401, json: { error: 'nope' } }; },
      async () => { ran.push('g3'); return null; }
    ],
    action: async () => { ran.push('action'); }
  }];

  const handle = createRouter(routes, {});
  const res = fakeRes();
  await handle({ method: 'POST', url: '/x', headers: {} }, res);

  assert.deepStrictEqual(ran, ['g1', 'g2']);
  assert.strictEqual(res.statusCode, 401);
  assert.deepStrictEqual(JSON.parse(res.body), { error: 'nope' });
});

test('a text rejection is sent as plain text, not JSON', async () => {
  const routes = [{
    method: 'POST',
    path: '/x',
    guards: [async () => ({ status: 404, text: 'not found' })],
    action: async () => { throw new Error('must not run'); }
  }];

  const handle = createRouter(routes, {});
  const res = fakeRes();
  await handle({ method: 'POST', url: '/x', headers: {} }, res);

  assert.strictEqual(res.statusCode, 404);
  assert.strictEqual(res.body, 'not found');
});

test('router reaches the action when every guard passes', async () => {
  const routes = [{
    method: 'GET',
    path: '/ok',
    guards: [async () => null],
    action: async context => { context.res.writeHead(200); context.res.end('done'); }
  }];

  const handle = createRouter(routes, { flag: 1 });
  const res = fakeRes();
  await handle({ method: 'GET', url: '/ok', headers: {} }, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body, 'done');
});

test('router answers 405 when no route matches', async () => {
  const handle = createRouter([], {});
  const res = fakeRes();
  await handle({ method: 'DELETE', url: '/nope', headers: {} }, res);

  assert.strictEqual(res.statusCode, 405);
  assert.strictEqual(res.body, 'method not allowed');
});

test('the first matching route wins, so a catch-all must be listed last', async () => {
  const hits = [];
  const routes = [
    { method: 'GET', path: '/specific', action: async c => { hits.push('specific'); c.res.writeHead(200); c.res.end(''); } },
    { method: 'GET', action: async c => { hits.push('catchall'); c.res.writeHead(200); c.res.end(''); } }
  ];

  const handle = createRouter(routes, {});
  await handle({ method: 'GET', url: '/specific', headers: {} }, fakeRes());
  await handle({ method: 'GET', url: '/anything-else', headers: {} }, fakeRes());

  assert.deepStrictEqual(hits, ['specific', 'catchall']);
});

test('router passes deps and the parsed url through the context', async () => {
  let seen;
  const routes = [{
    method: 'GET',
    path: '/probe',
    action: async context => { seen = context; context.res.writeHead(204); context.res.end(''); }
  }];

  const handle = createRouter(routes, { dev: true });
  await handle({ method: 'GET', url: '/probe?a=1', headers: {} }, fakeRes());

  assert.strictEqual(seen.deps.dev, true);
  assert.strictEqual(seen.url.pathname, '/probe');
  assert.strictEqual(seen.url.searchParams.get('a'), '1');
});
