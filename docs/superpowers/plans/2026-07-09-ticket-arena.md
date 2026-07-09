# Ticket Arena Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** FPS-style gamified live leaderboard for a 5-person support-ticket team: webhook-fed events trigger announcer voice + synthesized stingers + banners, with a daily-resetting leaderboard.

**Architecture:** Zero-dependency Node.js HTTP server (SSE for live push, append-only JSONL event log, pure game engine) + vanilla JS frontend (announcement queue, WebAudio stingers, SpeechSynthesis voice, FLIP animations). Webhook adapter is the isolated seam for a future Laravel port.

**Tech Stack:** Node.js ≥ 18 (built-in `http`, `node:test`), vanilla HTML/CSS/JS. **No npm dependencies.**

## Global Constraints

- Zero npm dependencies, server and frontend (spec: "no framework lock-in").
- Timezone for day boundaries: `Europe/Tirane`, computed via `Intl.DateTimeFormat('en-CA', { timeZone })`.
- Agents: Alpet, Bajram, Kushtrim, Mirlind, Ermira (config.json is the source of truth).
- Frontend talks to backend ONLY via `POST /api/events`, `GET /api/state`, `GET /events` (SSE).
- All rendered strings HTML-escaped.
- `data/` is gitignored.
- Tests run with `node --test tests/`.

---

### Task 1: Scaffold — config, package, gitignore

**Files:**
- Create: `package.json`, `config.json`, `.gitignore`

**Interfaces:**
- Produces: `config.json` shape consumed by every later task:
  `{ port: number, timezone: string, webhookSecret: string, agents: string[], services: string[] }`

- [ ] **Step 1: Write the three files**

`package.json`:
```json
{
  "name": "ticket-arena",
  "version": "1.0.0",
  "private": true,
  "description": "FPS-style gamified leaderboard for support tickets",
  "scripts": {
    "start": "node server.js",
    "dev": "cross-env-free DEV=1 node server.js",
    "test": "node --test tests/"
  }
}
```
Note: on Windows PowerShell run dev mode as `$env:DEV='1'; node server.js`. Remove the `dev` script line above and instead document it — final `scripts`:
```json
  "scripts": {
    "start": "node server.js",
    "test": "node --test tests/"
  }
```

`config.json`:
```json
{
  "port": 3000,
  "timezone": "Europe/Tirane",
  "webhookSecret": "arena-dev-secret",
  "agents": ["Alpet", "Bajram", "Kushtrim", "Mirlind", "Ermira"],
  "services": ["Billing", "Hosting", "Domains", "Email", "VPN"]
}
```

`.gitignore`:
```
node_modules/
data/
```

- [ ] **Step 2: Verify config parses**

Run: `node -e "console.log(JSON.parse(require('fs').readFileSync('config.json','utf8')).agents.length)"`
Expected: `5`

- [ ] **Step 3: Commit**

```bash
git add package.json config.json .gitignore
git commit -m "chore: scaffold ticket-arena config and package"
```

---

### Task 2: Game engine (pure logic)

**Files:**
- Create: `lib/engine.js`
- Test: `tests/engine.test.js`

**Interfaces:**
- Produces (CommonJS exports from `lib/engine.js`):
  - `dayKey(ts: number|string|Date, timezone: string): string` — e.g. `"2026-07-09"`
  - `createDay(agents: string[]): State`
  - `applyEvent(state: State, event: {id,type,agent,service,ticketId,ts}): { accepted: boolean, announcements: Announcement[] }` — mutates `state`
  - `publicState(state): { leaderboard: [{rank,agent,solved,streak}], firstBlood: {agent,service,ts}|null, feed: FeedItem[] }`
  - `TIERS`: record of count → `{ name, line }`
  - Announcement: `{ kind: 'first_blood'|'new_ticket'|'tier', count?, agent, service, title, line }`
  - FeedItem: `{ type, agent, service, ticketId, ts, label }` (newest first, max 8)

- [ ] **Step 1: Write the failing tests**

`tests/engine.test.js`:
```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/`
Expected: FAIL — `Cannot find module '../lib/engine'`

- [ ] **Step 3: Implement `lib/engine.js`**

```js
'use strict';

const TIERS = {
  1:  { name: 'SOLVED',        line: 'Ticket solved by {name}' },
  2:  { name: 'DOUBLE KILL',   line: 'Double kill! {name}' },
  3:  { name: 'TRIPLE KILL',   line: 'Triple kill! {name}' },
  4:  { name: 'KILLING SPREE', line: '{name} is on a killing spree!' },
  5:  { name: 'UNSTOPPABLE',   line: '{name} is unstoppable!' },
  7:  { name: 'RAMPAGE',       line: '{name} is on a rampage!' },
  10: { name: 'GODLIKE',       line: '{name} is GODLIKE!' },
  15: { name: 'MONSTER KILL',  line: 'M M M MONSTER KILL! {name}' }
};

const FEED_MAX = 8;

function dayKey(ts, timezone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(ts));
}

function createDay(agents) {
  return {
    agents: [...agents],
    counts: Object.fromEntries(agents.map(a => [a, 0])),
    reachedAt: {},          // agent -> ts of latest counted resolve
    createdIds: new Set(),
    resolvedIds: new Set(),
    firstBlood: null,       // { agent, service, ts }
    feed: []                // newest first
  };
}

function pushFeed(state, event, label) {
  state.feed.unshift({
    type: event.type, agent: event.agent, service: event.service,
    ticketId: event.ticketId, ts: event.ts, label
  });
  if (state.feed.length > FEED_MAX) state.feed.length = FEED_MAX;
}

function applyEvent(state, event) {
  const announcements = [];
  if (!state.agents.includes(event.agent)) return { accepted: false, announcements };

  if (event.type === 'ticket.created') {
    if (state.createdIds.has(event.ticketId)) return { accepted: false, announcements };
    state.createdIds.add(event.ticketId);
    if (!state.firstBlood) {
      state.firstBlood = { agent: event.agent, service: event.service, ts: event.ts };
      announcements.push({
        kind: 'first_blood', agent: event.agent, service: event.service,
        title: 'FIRST BLOOD',
        line: `First blood on ${event.service} by ${event.agent}`
      });
      pushFeed(state, event, 'FIRST BLOOD');
    } else {
      announcements.push({
        kind: 'new_ticket', agent: event.agent, service: event.service,
        title: 'NEW TICKET',
        line: `New ticket by ${event.agent}`
      });
      pushFeed(state, event, 'opened');
    }
    return { accepted: true, announcements };
  }

  if (event.type === 'ticket.resolved') {
    if (state.resolvedIds.has(event.ticketId)) return { accepted: false, announcements };
    state.resolvedIds.add(event.ticketId);
    state.counts[event.agent] += 1;
    state.reachedAt[event.agent] = event.ts;
    const count = state.counts[event.agent];
    const tier = TIERS[count];
    if (tier) {
      announcements.push({
        kind: 'tier', count, agent: event.agent, service: event.service,
        title: tier.name,
        line: tier.line.replace('{name}', event.agent)
      });
    }
    pushFeed(state, event, 'solved');
    return { accepted: true, announcements };
  }

  return { accepted: false, announcements };
}

function publicState(state) {
  const leaderboard = state.agents
    .map((agent, order) => ({
      agent,
      solved: state.counts[agent],
      reachedAt: state.reachedAt[agent] ?? Number.MAX_SAFE_INTEGER,
      order
    }))
    .sort((a, b) => b.solved - a.solved || a.reachedAt - b.reachedAt || a.order - b.order)
    .map(({ agent, solved }, i) => ({ rank: i + 1, agent, solved, streak: solved >= 3 }));

  return { leaderboard, firstBlood: state.firstBlood, feed: state.feed };
}

module.exports = { TIERS, dayKey, createDay, applyEvent, publicState };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/`
Expected: all engine tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/engine.js tests/engine.test.js
git commit -m "feat: pure game engine (first blood, kill tiers, tie-break, feed)"
```

---

### Task 3: Event store (append-only JSONL)

**Files:**
- Create: `lib/store.js`
- Test: `tests/store.test.js`

**Interfaces:**
- Consumes: `dayKey` from `lib/engine.js`
- Produces: `createStore(filePath: string, timezone: string)` →
  `{ todayEvents(now?: number): Event[], append(event): void, clear(): void }`

- [ ] **Step 1: Write the failing tests**

`tests/store.test.js`:
```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../lib/store');

function tmpFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'arena-')), 'events.jsonl');
}

test('append then todayEvents round-trips events from today', () => {
  const store = createStore(tmpFile(), 'Europe/Tirane');
  const now = Date.now();
  store.append({ id: 'e1', type: 'ticket.resolved', agent: 'Alpet', service: 'Email', ticketId: 'T-1', ts: now });
  const events = store.todayEvents(now);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].ticketId, 'T-1');
});

test('todayEvents filters out events from other days', () => {
  const store = createStore(tmpFile(), 'Europe/Tirane');
  const now = Date.now();
  store.append({ id: 'e1', type: 'ticket.resolved', agent: 'Alpet', service: 'Email', ticketId: 'OLD', ts: now - 3 * 86400000 });
  store.append({ id: 'e2', type: 'ticket.resolved', agent: 'Alpet', service: 'Email', ticketId: 'NEW', ts: now });
  const events = store.todayEvents(now);
  assert.deepStrictEqual(events.map(e => e.ticketId), ['NEW']);
});

test('malformed lines are skipped without crashing', () => {
  const file = tmpFile();
  const store = createStore(file, 'Europe/Tirane');
  const now = Date.now();
  store.append({ id: 'e1', type: 'ticket.created', agent: 'Ermira', service: 'VPN', ticketId: 'T-1', ts: now });
  fs.appendFileSync(file, 'NOT JSON{{{\n');
  store.append({ id: 'e2', type: 'ticket.created', agent: 'Ermira', service: 'VPN', ticketId: 'T-2', ts: now });
  assert.strictEqual(store.todayEvents(now).length, 2);
});

test('missing file yields empty list; clear empties the log', () => {
  const store = createStore(tmpFile(), 'Europe/Tirane');
  assert.deepStrictEqual(store.todayEvents(), []);
  store.append({ id: 'e1', type: 'ticket.created', agent: 'Ermira', service: 'VPN', ticketId: 'T-1', ts: Date.now() });
  store.clear();
  assert.deepStrictEqual(store.todayEvents(), []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/`
Expected: store tests FAIL — `Cannot find module '../lib/store'`

- [ ] **Step 3: Implement `lib/store.js`**

```js
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { dayKey } = require('./engine');

function createStore(filePath, timezone) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  function readAll() {
    if (!fs.existsSync(filePath)) return [];
    return fs.readFileSync(filePath, 'utf8')
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try { return JSON.parse(line); }
        catch { console.warn('store: skipping malformed line'); return null; }
      })
      .filter(Boolean);
  }

  return {
    todayEvents(now = Date.now()) {
      const today = dayKey(now, timezone);
      return readAll().filter(e => e && e.ts && dayKey(e.ts, timezone) === today);
    },
    append(event) {
      fs.appendFileSync(filePath, JSON.stringify(event) + '\n');
    },
    clear() {
      fs.writeFileSync(filePath, '');
    }
  };
}

module.exports = { createStore };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add lib/store.js tests/store.test.js
git commit -m "feat: append-only jsonl event store with day filtering"
```

---

### Task 4: Webhook adapter (the swap seam)

**Files:**
- Create: `lib/adapter.js`
- Test: `tests/adapter.test.js`

**Interfaces:**
- Produces: `parseWebhook(body: unknown, agents: string[]): { ok: true, event } | { ok: false, error: string }`
  where `event = { id: uuid, type, agent (canonical casing), service (default 'General'), ticketId, ts: Date.now() }`

- [ ] **Step 1: Write the failing tests**

`tests/adapter.test.js`:
```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/`
Expected: adapter tests FAIL — `Cannot find module '../lib/adapter'`

- [ ] **Step 3: Implement `lib/adapter.js`**

```js
'use strict';
const crypto = require('node:crypto');

const TYPES = new Set(['ticket.created', 'ticket.resolved']);

// The single seam between the outside world and the game engine.
// A future helpdesk (or Laravel port) only needs to satisfy this contract.
function parseWebhook(body, agents) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'body must be a JSON object' };
  }
  const { type, agent, service, ticketId } = body;
  if (!TYPES.has(type)) {
    return { ok: false, error: `type must be one of: ${[...TYPES].join(', ')}` };
  }
  const canonical = agents.find(a => a.toLowerCase() === String(agent ?? '').trim().toLowerCase());
  if (!canonical) {
    return { ok: false, error: `unknown agent: ${String(agent)}` };
  }
  const tid = String(ticketId ?? '').trim();
  if (!tid || tid === 'undefined' || tid === 'null') {
    return { ok: false, error: 'ticketId is required' };
  }
  const svc = String(service ?? '').trim();
  return {
    ok: true,
    event: {
      id: crypto.randomUUID(),
      type,
      agent: canonical,
      service: svc || 'General',
      ticketId: tid,
      ts: Date.now()
    }
  };
}

module.exports = { parseWebhook };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add lib/adapter.js tests/adapter.test.js
git commit -m "feat: webhook adapter - validated seam between helpdesk and engine"
```

---

### Task 5: HTTP server with SSE and static serving

**Files:**
- Create: `server.js`

**Interfaces:**
- Consumes: `createDay/applyEvent/publicState/dayKey` (engine), `createStore` (store), `parseWebhook` (adapter), `config.json`
- Produces (HTTP API — the frontend and any webhook sender rely on these exactly):
  - `POST /api/events` — requires header `X-Webhook-Secret`; 401 bad secret, 400 invalid payload, 200 `{ accepted: boolean }`
  - `GET /api/state` — 200 `{ day, state: publicState }`
  - `GET /events` — SSE; messages are `data: { day, state, announcements, dayRolled? }`
  - `POST /api/dev/reset` — only when `process.env.DEV === '1'`, else 404
  - `GET /*` — static files from `public/`

- [ ] **Step 1: Implement `server.js`**

```js
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createDay, applyEvent, publicState, dayKey } = require('./lib/engine');
const { createStore } = require('./lib/store');
const { parseWebhook } = require('./lib/adapter');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const DEV = process.env.DEV === '1';
const PUBLIC_DIR = path.join(__dirname, 'public');
const store = createStore(path.join(__dirname, 'data', 'events.jsonl'), config.timezone);

// ---- game state ----
let currentDay = dayKey(Date.now(), config.timezone);
let state = createDay(config.agents);

function rebuildFromLog() {
  state = createDay(config.agents);
  for (const event of store.todayEvents()) applyEvent(state, event);
}
rebuildFromLog();

// ---- SSE ----
const sseClients = new Set();

function broadcast(payload) {
  const frame = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) res.write(frame);
}

function snapshot(extra = {}) {
  return { day: currentDay, state: publicState(state), announcements: [], ...extra };
}

// ---- day roll ----
setInterval(() => {
  const today = dayKey(Date.now(), config.timezone);
  if (today !== currentDay) {
    currentDay = today;
    state = createDay(config.agents);
    console.log(`[arena] day rolled to ${today} - board reset`);
    broadcast(snapshot({ dayRolled: true }));
  }
}, 30000);

// ---- helpers ----
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 64 * 1024) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.json': 'application/json'
};

function serveStatic(req, res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

// ---- server ----
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'POST' && url.pathname === '/api/events') {
    if (config.webhookSecret && req.headers['x-webhook-secret'] !== config.webhookSecret) {
      return sendJson(res, 401, { error: 'bad secret' });
    }
    let body;
    try { body = JSON.parse(await readBody(req) || 'null'); }
    catch { return sendJson(res, 400, { error: 'invalid JSON' }); }

    const parsed = parseWebhook(body, config.agents);
    if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });

    const { accepted, announcements } = applyEvent(state, parsed.event);
    if (accepted) {
      store.append(parsed.event);
      broadcast(snapshot({ announcements }));
      console.log(`[arena] ${parsed.event.type} ${parsed.event.ticketId} by ${parsed.event.agent}` +
        (announcements[0] ? ` -> ${announcements[0].title}` : ''));
    }
    return sendJson(res, 200, { accepted });
  }

  if (req.method === 'GET' && url.pathname === '/api/state') {
    return sendJson(res, 200, snapshot());
  }

  if (req.method === 'GET' && url.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write(`data: ${JSON.stringify(snapshot())}\n\n`);
    sseClients.add(res);
    const keepAlive = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(keepAlive); sseClients.delete(res); });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/dev/reset') {
    if (!DEV) { res.writeHead(404); return res.end('not found'); }
    store.clear();
    state = createDay(config.agents);
    broadcast(snapshot({ dayRolled: true }));
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET') return serveStatic(req, res, url.pathname);

  res.writeHead(405);
  res.end('method not allowed');
});

server.listen(config.port, () => {
  console.log(`
  ████████╗██╗ ██████╗██╗  ██╗███████╗████████╗     █████╗ ██████╗ ███████╗███╗   ██╗ █████╗
     ██║   ██║██╔════╝██║ ██╔╝██╔════╝╚══██╔══╝    ██╔══██╗██╔══██╗██╔════╝████╗  ██║██╔══██╗
     ██║   ██║██║     █████╔╝ █████╗     ██║       ███████║██████╔╝█████╗  ██╔██╗ ██║███████║
     ██║   ██║╚██████╗██║  ██╗███████╗   ██║       ██║  ██║██║  ██║███████╗██║ ╚████║██║  ██║
     ╚═╝   ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝   ╚═╝       ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝╚═╝  ╚═╝
  TICKET ARENA  |  http://localhost:${config.port}  |  day: ${currentDay}  |  DEV: ${DEV ? 'ON' : 'off'}
  `);
});
```

- [ ] **Step 2: Verify with curl (server in background)**

Run (PowerShell): `Start-Process node server.js` then:
```bash
curl -s http://localhost:3000/api/state
curl -s -X POST http://localhost:3000/api/events -H "Content-Type: application/json" -H "X-Webhook-Secret: arena-dev-secret" -d '{"type":"ticket.resolved","agent":"Ermira","ticketId":"T-100"}'
curl -s -X POST http://localhost:3000/api/events -H "X-Webhook-Secret: WRONG" -d '{}'
curl -s http://localhost:3000/api/state
```
Expected: first state shows all zeros; POST returns `{"accepted":true}`; wrong secret returns 401 `{"error":"bad secret"}`; second state shows Ermira solved=1 at rank 1. Duplicate POST of same ticketId returns `{"accepted":false}`. Then stop the server and delete `data/events.jsonl` (or run the dev reset) so the manual test event doesn't pollute later runs.

- [ ] **Step 3: Run full test suite (regression)**

Run: `node --test tests/`
Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat: zero-dep http server with SSE broadcast, webhook endpoint, static serving"
```

---

### Task 6: Frontend markup + arena theme

**Files:**
- Create: `public/index.html`, `public/css/styles.css`

**Interfaces:**
- Produces DOM ids consumed by Task 7/8 JS: `#unlock-gate`, `#board`, `#feed`, `#announce` (with `#announce-title`, `#announce-line`), `#mini-banner`, `#first-blood-chip`, `#day-label`, `#test-panel`, `#test-agent-grid`, `#test-service`, `#test-secret`, `#test-reset`
- Loads `/js/announcer.js` then `/js/app.js` (plain scripts, `announcer.js` defines `window.Announcer`)

- [ ] **Step 1: Write `public/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ticket Arena</title>
<link rel="stylesheet" href="/css/styles.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🎯</text></svg>">
</head>
<body>

<div id="unlock-gate">
  <div class="gate-inner">
    <div class="gate-title">TICKET ARENA</div>
    <button id="unlock-btn">CLICK TO ARM SPEAKERS 🔊</button>
    <div class="gate-hint">browser needs one click before it may play sound</div>
  </div>
</div>

<header>
  <h1 class="site-title">TICKET <span class="accent">ARENA</span></h1>
  <div class="header-meta">
    <span id="day-label" class="day-label"></span>
    <span id="first-blood-chip" class="fb-chip hidden"></span>
    <span id="conn-dot" class="conn-dot" title="live connection"></span>
  </div>
</header>

<main>
  <section class="board-wrap">
    <ol id="board" class="board"></ol>
  </section>
  <aside class="feed-wrap">
    <h2 class="feed-title">KILL FEED</h2>
    <ul id="feed" class="feed"></ul>
  </aside>
</main>

<div id="mini-banner" class="mini-banner hidden"></div>

<div id="announce" class="announce hidden">
  <div class="announce-inner">
    <div id="announce-title" class="announce-title"></div>
    <div id="announce-line" class="announce-line"></div>
  </div>
</div>

<div id="test-panel" class="test-panel hidden">
  <div class="tp-head">TEST PANEL <span class="tp-hint">(press T to hide)</span></div>
  <div class="tp-row">
    <label>service <select id="test-service"></select></label>
    <label>secret <input id="test-secret" type="text" size="16"></label>
    <button id="test-reset" class="tp-danger">RESET DAY</button>
  </div>
  <div id="test-agent-grid" class="tp-grid"></div>
</div>

<script src="/js/announcer.js"></script>
<script src="/js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `public/css/styles.css`**

```css
/* ===== Ticket Arena — dark FPS theme ===== */
:root {
  --bg: #0b0e13;
  --panel: #12161f;
  --panel2: #171c28;
  --line: #232a3a;
  --text: #e8ecf4;
  --dim: #7d8799;
  --accent: #ff3b3b;
  --gold: #ffc53d;
  --green: #3dd68c;
  --blue: #4da3ff;
  --glow: 0 0 18px;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: 100%; }
body {
  background: radial-gradient(1200px 600px at 50% -10%, #141a26 0%, var(--bg) 60%);
  color: var(--text);
  font-family: "Segoe UI", system-ui, sans-serif;
  overflow-x: hidden;
}

/* ---- unlock gate ---- */
#unlock-gate {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(6, 8, 12, 0.96);
  display: flex; align-items: center; justify-content: center;
}
#unlock-gate.hidden { display: none; }
.gate-inner { text-align: center; }
.gate-title { font-size: 2.2rem; font-weight: 900; letter-spacing: 0.4em; color: var(--accent); margin-bottom: 2rem; text-shadow: var(--glow) rgba(255,59,59,.5); }
#unlock-btn {
  font: inherit; font-size: 1.3rem; font-weight: 700; letter-spacing: .1em;
  padding: 1rem 2.5rem; cursor: pointer;
  color: var(--text); background: var(--panel2);
  border: 2px solid var(--accent); border-radius: 8px;
  box-shadow: var(--glow) rgba(255,59,59,.35);
  transition: transform .15s, box-shadow .15s;
}
#unlock-btn:hover { transform: scale(1.05); box-shadow: var(--glow) rgba(255,59,59,.7); }
.gate-hint { margin-top: 1rem; color: var(--dim); font-size: .85rem; }

/* ---- header ---- */
header {
  display: flex; align-items: baseline; justify-content: space-between;
  padding: 1.2rem 2rem .8rem;
  border-bottom: 1px solid var(--line);
}
.site-title { font-size: 2rem; font-weight: 900; letter-spacing: .25em; }
.site-title .accent { color: var(--accent); text-shadow: var(--glow) rgba(255,59,59,.45); }
.header-meta { display: flex; align-items: center; gap: 1rem; }
.day-label { color: var(--dim); letter-spacing: .1em; }
.fb-chip {
  background: linear-gradient(90deg, #3a0d0d, #1c0f0f);
  border: 1px solid var(--accent); border-radius: 999px;
  padding: .3rem .9rem; font-size: .85rem; font-weight: 700; letter-spacing: .05em;
}
.fb-chip.hidden { display: none; }
.conn-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--dim); }
.conn-dot.live { background: var(--green); box-shadow: 0 0 8px rgba(61,214,140,.8); }

/* ---- layout ---- */
main {
  display: grid; grid-template-columns: 1fr 320px; gap: 1.5rem;
  padding: 1.5rem 2rem; max-width: 1400px; margin: 0 auto;
}
@media (max-width: 900px) { main { grid-template-columns: 1fr; } }

/* ---- leaderboard ---- */
.board { list-style: none; display: flex; flex-direction: column; gap: .8rem; }
.board-row {
  display: grid; grid-template-columns: 4rem 1fr auto; align-items: center; gap: 1rem;
  background: var(--panel); border: 1px solid var(--line); border-radius: 12px;
  padding: 1.1rem 1.5rem;
  transition: border-color .3s, background .3s;
  position: relative; overflow: hidden;
}
.board-row .rank { font-size: 1.6rem; font-weight: 900; color: var(--dim); font-variant-numeric: tabular-nums; }
.board-row .agent { font-size: 1.7rem; font-weight: 700; letter-spacing: .04em; display: flex; align-items: center; gap: .6rem; }
.board-row .solved { font-size: 2.2rem; font-weight: 900; font-variant-numeric: tabular-nums; color: var(--blue); }
.board-row.top1 { border-color: var(--gold); background: linear-gradient(90deg, rgba(255,197,61,.10), var(--panel) 45%); }
.board-row.top1 .rank { color: var(--gold); }
.board-row.top1 .rank::after { content: " 👑"; font-size: 1.1rem; }
.board-row.top1 .solved { color: var(--gold); }
.streak-badge { font-size: 1.1rem; filter: drop-shadow(0 0 6px rgba(255,120,30,.9)); animation: flicker 1.4s infinite; }
@keyframes flicker { 0%,100% { opacity: 1; } 50% { opacity: .6; transform: scale(1.08); } }

/* score glow when a row just scored */
.board-row.scored { animation: scoredPulse 1.6s ease-out; }
@keyframes scoredPulse {
  0% { box-shadow: 0 0 0 rgba(61,214,140,0); border-color: var(--green); }
  25% { box-shadow: 0 0 26px rgba(61,214,140,.55); }
  100% { box-shadow: 0 0 0 rgba(61,214,140,0); }
}
/* FLIP movement */
.board-row.moving { transition: transform .6s cubic-bezier(.2,.9,.25,1.2); }

/* ---- kill feed ---- */
.feed-wrap { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 1rem 1.2rem; align-self: start; }
.feed-title { font-size: .9rem; letter-spacing: .3em; color: var(--dim); margin-bottom: .8rem; }
.feed { list-style: none; display: flex; flex-direction: column; gap: .55rem; }
.feed li { font-size: .9rem; color: var(--dim); display: flex; justify-content: space-between; gap: .8rem; animation: feedIn .35s ease-out; }
.feed li .who { color: var(--text); font-weight: 600; }
.feed li .what.solved { color: var(--green); }
.feed li .what.opened { color: var(--blue); }
.feed li .what.blood { color: var(--accent); font-weight: 800; }
.feed li time { font-variant-numeric: tabular-nums; flex-shrink: 0; }
@keyframes feedIn { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: none; } }

/* ---- mini banner (blips) ---- */
.mini-banner {
  position: fixed; top: 1rem; left: 50%; transform: translateX(-50%);
  z-index: 60; padding: .6rem 1.6rem; border-radius: 999px;
  background: var(--panel2); border: 1px solid var(--blue);
  font-weight: 700; letter-spacing: .05em;
  box-shadow: 0 0 20px rgba(77,163,255,.35);
  animation: miniIn .3s ease-out;
}
.mini-banner.hidden { display: none; }
@keyframes miniIn { from { opacity: 0; transform: translate(-50%, -16px); } to { opacity: 1; transform: translate(-50%, 0); } }

/* ---- fullscreen announcement ---- */
.announce {
  position: fixed; inset: 0; z-index: 80;
  display: flex; align-items: center; justify-content: center;
  background: rgba(8, 4, 6, 0.88);
  backdrop-filter: blur(3px);
}
.announce.hidden { display: none; }
.announce-inner { text-align: center; animation: slamIn .45s cubic-bezier(.15,1.3,.3,1); }
.announce-title {
  font-size: clamp(3rem, 9vw, 7rem); font-weight: 900; letter-spacing: .12em;
  color: var(--accent);
  text-shadow: 0 0 30px rgba(255,59,59,.8), 0 0 90px rgba(255,59,59,.4);
  animation: titleShake .5s .1s;
}
.announce.gold .announce-title { color: var(--gold); text-shadow: 0 0 30px rgba(255,197,61,.8), 0 0 90px rgba(255,197,61,.4); }
.announce-line { margin-top: 1.2rem; font-size: clamp(1.2rem, 3vw, 2rem); color: var(--text); letter-spacing: .08em; }
@keyframes slamIn { from { transform: scale(2.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes titleShake {
  0%,100% { transform: none; } 20% { transform: translate(-4px, 2px); }
  40% { transform: translate(4px, -2px); } 60% { transform: translate(-3px, -2px); } 80% { transform: translate(3px, 2px); }
}

/* ---- test panel ---- */
.test-panel {
  position: fixed; bottom: 1rem; right: 1rem; z-index: 70;
  background: var(--panel2); border: 1px dashed var(--dim); border-radius: 10px;
  padding: 1rem; width: 380px; font-size: .9rem;
}
.test-panel.hidden { display: none; }
.tp-head { font-weight: 800; letter-spacing: .15em; margin-bottom: .6rem; }
.tp-hint { color: var(--dim); font-weight: 400; letter-spacing: 0; }
.tp-row { display: flex; gap: .8rem; align-items: center; margin-bottom: .8rem; flex-wrap: wrap; }
.tp-row label { color: var(--dim); display: flex; gap: .35rem; align-items: center; }
.tp-row select, .tp-row input {
  font: inherit; color: var(--text); background: var(--panel);
  border: 1px solid var(--line); border-radius: 6px; padding: .25rem .5rem;
}
.tp-grid { display: grid; grid-template-columns: auto 1fr 1fr; gap: .4rem .6rem; align-items: center; }
.tp-grid .tp-name { font-weight: 700; }
.tp-grid button, .tp-danger {
  font: inherit; font-size: .8rem; font-weight: 700; cursor: pointer;
  color: var(--text); background: var(--panel); border: 1px solid var(--line);
  border-radius: 6px; padding: .35rem .5rem;
}
.tp-grid button:hover { border-color: var(--blue); }
.tp-grid button.solve:hover { border-color: var(--green); }
.tp-danger { border-color: #6b2626; color: #ff9c9c; }
```

- [ ] **Step 3: Visual smoke check**

Run the server, open `http://localhost:3000` — the unlock gate shows; behind it the header renders (board/feed empty until Task 8). No console 404 for CSS.

- [ ] **Step 4: Commit**

```bash
git add public/index.html public/css/styles.css
git commit -m "feat: arena frontend markup and dark FPS theme"
```

---

### Task 7: Announcer — queue, WebAudio stingers, speech

**Files:**
- Create: `public/js/announcer.js`

**Interfaces:**
- Consumes DOM ids from Task 6: `#announce`, `#announce-title`, `#announce-line`, `#mini-banner`
- Produces `window.Announcer = { unlock(): void, enqueue(announcement): void }` where announcement is the engine's `{ kind, count?, title, line }`

- [ ] **Step 1: Implement `public/js/announcer.js`**

```js
/* Announcer: strictly-serial announcement queue.
   Each item: stinger (WebAudio synth) -> voice line (SpeechSynthesis) -> banner hides -> gap -> next.
   Pattern adapted from first-strike-alert's announcement queue. */
(function () {
  'use strict';

  const GAP_MS = 1200;
  const SPEECH_TIMEOUT_MS = 8000;

  const overlay = document.getElementById('announce');
  const overlayTitle = document.getElementById('announce-title');
  const overlayLine = document.getElementById('announce-line');
  const mini = document.getElementById('mini-banner');

  let ctx = null;
  let queue = [];
  let playing = false;

  function unlock() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume();
    // prime speechSynthesis inside the user gesture
    const u = new SpeechSynthesisUtterance('');
    u.volume = 0;
    speechSynthesis.speak(u);
  }

  // ---- stinger synthesis ----
  function tone(freq, start, dur, { type = 'square', gain = 0.18, slideTo = null } = {}) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + start + dur);
    g.gain.setValueAtTime(0, ctx.currentTime + start);
    g.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(ctx.currentTime + start);
    osc.stop(ctx.currentTime + start + dur + 0.05);
  }

  function noiseHit(start, dur, gain = 0.25) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    src.buffer = buf;
    g.gain.value = gain;
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start(ctx.currentTime + start);
  }

  // returns stinger duration in ms
  const STINGERS = {
    blip() { tone(880, 0, 0.1, { type: 'sine', gain: 0.12 }); tone(1320, 0.1, 0.12, { type: 'sine', gain: 0.10 }); return 300; },
    solved() { tone(523, 0, 0.11); tone(784, 0.12, 0.18, { gain: 0.15 }); return 400; },
    first_blood() {
      noiseHit(0, 0.5, 0.3);
      tone(150, 0, 0.7, { type: 'sawtooth', gain: 0.28, slideTo: 40 });
      tone(75, 0.25, 0.9, { type: 'sawtooth', gain: 0.22, slideTo: 30 });
      noiseHit(0.55, 0.35, 0.18);
      return 1400;
    },
    tier(count) {
      // rising arpeggio, one note per kill (capped), ending on a power chord
      const notes = Math.min(count, 8);
      const base = 330;
      for (let i = 0; i < notes; i++) {
        tone(base * Math.pow(1.2, i), i * 0.09, 0.12, { gain: 0.14 });
      }
      const endAt = notes * 0.09;
      tone(base * Math.pow(1.2, notes), endAt, 0.5, { type: 'sawtooth', gain: 0.2 });
      tone(base * Math.pow(1.2, notes) * 1.5, endAt, 0.5, { type: 'sawtooth', gain: 0.12 });
      if (count >= 5) noiseHit(endAt, 0.4, 0.2);
      return Math.round((endAt + 0.6) * 1000);
    }
  };

  function playStinger(a) {
    if (!ctx) return 0;
    if (a.kind === 'first_blood') return STINGERS.first_blood();
    if (a.kind === 'new_ticket') return STINGERS.blip();
    if (a.kind === 'tier') return a.count >= 2 ? STINGERS.tier(a.count) : STINGERS.solved();
    return 0;
  }

  // ---- speech ----
  function speak(line) {
    return new Promise(resolve => {
      if (!('speechSynthesis' in window)) return setTimeout(resolve, 2000);
      const u = new SpeechSynthesisUtterance(line);
      u.rate = 0.95;
      u.pitch = 0.7;
      u.volume = 1;
      const en = speechSynthesis.getVoices().find(v => v.lang.startsWith('en'));
      if (en) u.voice = en;
      const done = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(done, SPEECH_TIMEOUT_MS);
      u.onend = done;
      u.onerror = done;
      speechSynthesis.speak(u);
    });
  }

  // ---- banners ----
  function showBanner(a) {
    const big = a.kind === 'first_blood' || (a.kind === 'tier' && a.count >= 2);
    if (big) {
      overlayTitle.textContent = a.title;
      overlayLine.textContent = a.line;
      overlay.classList.toggle('gold', a.kind === 'tier' && a.count >= 5);
      overlay.classList.remove('hidden');
    } else {
      mini.textContent = `${a.title} — ${a.line}`;
      mini.classList.remove('hidden');
    }
  }

  function hideBanners() {
    overlay.classList.add('hidden');
    mini.classList.add('hidden');
  }

  // ---- queue ----
  async function playNext() {
    if (playing) return;
    const a = queue.shift();
    if (!a) return;
    playing = true;
    try {
      showBanner(a);
      const stingerMs = playStinger(a);
      await new Promise(r => setTimeout(r, stingerMs));
      await speak(a.line);
      await new Promise(r => setTimeout(r, 400));
    } finally {
      hideBanners();
      playing = false;
      if (queue.length) setTimeout(playNext, GAP_MS);
    }
  }

  window.Announcer = {
    unlock,
    enqueue(a) { queue.push(a); playNext(); }
  };
})();
```

- [ ] **Step 2: Manual check in browser console**

Open the page, click the unlock button (once app.js exists it hides the gate; for now run `Announcer.unlock()` in console), then:
`Announcer.enqueue({kind:'first_blood', title:'FIRST BLOOD', line:'First blood on Billing by Ermira'})`
Expected: dramatic hit plays, fullscreen banner shows, voice speaks the line, banner hides.

- [ ] **Step 3: Commit**

```bash
git add public/js/announcer.js
git commit -m "feat: serial announcer queue with webaudio stingers and speech voice"
```

---

### Task 8: App — SSE client, leaderboard render, FLIP animations, test panel

**Files:**
- Create: `public/js/app.js`

**Interfaces:**
- Consumes: `window.Announcer`, DOM ids from Task 6, `GET /api/state`, `GET /events`, `POST /api/events`
- Produces: complete working app

- [ ] **Step 1: Implement `public/js/app.js`**

```js
(function () {
  'use strict';

  const board = document.getElementById('board');
  const feed = document.getElementById('feed');
  const dayLabel = document.getElementById('day-label');
  const fbChip = document.getElementById('first-blood-chip');
  const connDot = document.getElementById('conn-dot');
  const gate = document.getElementById('unlock-gate');

  let lastSolved = {};   // agent -> solved count, to detect who scored

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' });
  }

  // ---- render with FLIP rank animation ----
  function render(snapshot) {
    const { state, day } = snapshot;
    dayLabel.textContent = day;

    if (state.firstBlood) {
      fbChip.innerHTML = `🩸 FIRST BLOOD: <strong>${esc(state.firstBlood.agent)}</strong> on ${esc(state.firstBlood.service)}`;
      fbChip.classList.remove('hidden');
    } else {
      fbChip.classList.add('hidden');
    }

    // FLIP: capture old row positions
    const oldTops = {};
    for (const row of board.children) oldTops[row.dataset.agent] = row.getBoundingClientRect().top;

    board.innerHTML = state.leaderboard.map(r => `
      <li class="board-row ${r.rank === 1 && r.solved > 0 ? 'top1' : ''}" data-agent="${esc(r.agent)}">
        <span class="rank">#${r.rank}</span>
        <span class="agent">${esc(r.agent)} ${r.streak ? '<span class="streak-badge">🔥</span>' : ''}</span>
        <span class="solved">${r.solved}</span>
      </li>`).join('');

    // FLIP: invert + play
    for (const row of board.children) {
      const agent = row.dataset.agent;
      const oldTop = oldTops[agent];
      if (oldTop === undefined) continue;
      const delta = oldTop - row.getBoundingClientRect().top;
      if (delta) {
        row.style.transform = `translateY(${delta}px)`;
        requestAnimationFrame(() => {
          row.classList.add('moving');
          row.style.transform = '';
          row.addEventListener('transitionend', () => row.classList.remove('moving'), { once: true });
        });
      }
      // glow whoever's count went up
      const solved = state.leaderboard.find(r => r.agent === agent).solved;
      if (lastSolved[agent] !== undefined && solved > lastSolved[agent]) {
        row.classList.add('scored');
        row.addEventListener('animationend', () => row.classList.remove('scored'), { once: true });
      }
    }
    lastSolved = Object.fromEntries(state.leaderboard.map(r => [r.agent, r.solved]));

    feed.innerHTML = state.feed.map(f => {
      const cls = f.label === 'FIRST BLOOD' ? 'blood' : f.label === 'solved' ? 'solved' : 'opened';
      return `<li><span><span class="who">${esc(f.agent)}</span> <span class="what ${cls}">${esc(f.label)}</span> ${esc(f.ticketId)} <em>${esc(f.service)}</em></span><time>${fmtTime(f.ts)}</time></li>`;
    }).join('');
  }

  // ---- live connection ----
  function connect() {
    const es = new EventSource('/events');
    es.onopen = () => {
      connDot.classList.add('live');
      // catch up in case we missed events while disconnected
      fetch('/api/state').then(r => r.json()).then(render).catch(() => {});
    };
    es.onerror = () => connDot.classList.remove('live'); // EventSource auto-reconnects
    es.onmessage = e => {
      const msg = JSON.parse(e.data);
      render(msg);
      (msg.announcements || []).forEach(a => Announcer.enqueue(a));
      if (msg.dayRolled) lastSolved = {};
    };
  }

  // ---- unlock gate ----
  document.getElementById('unlock-btn').addEventListener('click', () => {
    Announcer.unlock();
    gate.classList.add('hidden');
  });

  // ---- test panel ----
  const panel = document.getElementById('test-panel');
  const secretInput = document.getElementById('test-secret');
  const serviceSel = document.getElementById('test-service');
  const grid = document.getElementById('test-agent-grid');

  const AGENTS = ['Alpet', 'Bajram', 'Kushtrim', 'Mirlind', 'Ermira'];
  const SERVICES = ['Billing', 'Hosting', 'Domains', 'Email', 'VPN'];

  secretInput.value = localStorage.getItem('arena-secret') || 'arena-dev-secret';
  secretInput.addEventListener('change', () => localStorage.setItem('arena-secret', secretInput.value));
  serviceSel.innerHTML = SERVICES.map(s => `<option>${esc(s)}</option>`).join('');

  let ticketSeq = Math.floor(Date.now() / 1000) % 100000;
  const openTickets = {}; // agent -> last opened ticketId (so Resolve can close "their" ticket)

  async function sendEvent(type, agent) {
    let ticketId;
    if (type === 'ticket.resolved' && openTickets[agent]) {
      ticketId = openTickets[agent];
      delete openTickets[agent];
    } else {
      ticketId = `T-${++ticketSeq}`;
      if (type === 'ticket.created') openTickets[agent] = ticketId;
    }
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': secretInput.value },
      body: JSON.stringify({ type, agent, service: serviceSel.value, ticketId })
    });
    if (!res.ok) console.warn('test event rejected:', res.status, await res.text());
  }

  grid.innerHTML = AGENTS.map(a => `
    <span class="tp-name">${esc(a)}</span>
    <button data-agent="${esc(a)}" data-type="ticket.created">+ ticket</button>
    <button data-agent="${esc(a)}" data-type="ticket.resolved" class="solve">✔ resolve</button>
  `).join('');

  grid.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (btn) sendEvent(btn.dataset.type, btn.dataset.agent);
  });

  document.getElementById('test-reset').addEventListener('click', () => {
    fetch('/api/dev/reset', { method: 'POST' }).then(r => {
      if (!r.ok) alert('reset only works when server runs with DEV=1');
    });
  });

  document.addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 't' && document.activeElement.tagName !== 'INPUT') {
      panel.classList.toggle('hidden');
    }
  });
  if (new URLSearchParams(location.search).get('test') === '1') panel.classList.remove('hidden');

  // ---- boot ----
  fetch('/api/state').then(r => r.json()).then(render).catch(() => {});
  connect();
})();
```

- [ ] **Step 2: Full end-to-end verification in browser**

1. Run: `$env:DEV='1'; node server.js`, open `http://localhost:3000?test=1`
2. Click "CLICK TO ARM SPEAKERS" — gate disappears.
3. RESET DAY — board shows all five agents at 0.
4. Click "+ ticket" for Ermira → FIRST BLOOD fullscreen banner + dramatic stinger + voice "First blood on Billing by Ermira"; kill feed shows it; header chip appears.
5. Click "+ ticket" for Alpet → mini banner + blip + "New ticket by Alpet".
6. Click "✔ resolve" for Kushtrim twice → "Ticket solved by Kushtrim" then DOUBLE KILL fullscreen; Kushtrim's row glows and FLIP-animates to rank 1.
7. Rapid-click resolve 3 more times for Kushtrim → TRIPLE KILL, KILLING SPREE, UNSTOPPABLE queue and play strictly one at a time.
8. Fire resolves for two agents to the same count → earlier one ranks higher.
9. Reload the page → board state persists (replayed from events.jsonl).
10. `node --test tests/` still all green.

- [ ] **Step 3: Commit**

```bash
git add public/js/app.js
git commit -m "feat: live app - sse client, flip leaderboard, kill feed, test panel"
```

---

### Task 9: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`** covering: what it is, quick start (`node server.js`, open localhost:3000, click to arm speakers), the webhook contract with a curl example, config.json fields, test panel (T key / ?test=1, DEV=1 for reset), day-reset behavior, kill-tier table, and the Laravel-port note (reimplement 3 routes, keep `public/` unchanged).

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: readme with webhook contract and quick start"
```
