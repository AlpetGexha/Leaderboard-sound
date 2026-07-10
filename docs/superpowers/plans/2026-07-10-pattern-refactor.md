# Pattern Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor Ticket Arena so `App.jsx` becomes pure composition and `announcer.js` becomes a set of focused single-purpose modules, applying Service, Action, Guard, SRP, Adapter, Composition Root, and Strategy patterns without changing production behavior.

**Architecture:** Bottom-up layered extraction. Pure domain helpers and guards first, then audio services behind adapters, then the announcer composition root, then React hooks, then components and actions, then the backend router. Each task is independently revertable and leaves `npm test` green.

**Tech Stack:** React 19, Vite 8, plain JavaScript (no TypeScript), Node's built-in test runner via `node --import tsx --test tests/*.test.js`, jsdom + @testing-library/react for component tests.

---

## Critical Constraints

Read these before writing any code. They are derived from the existing test harness and violating them turns the suite red.

**1. `EventSource` handlers must be assigned as properties.** `src/test/setup.js` defines `MockEventSource` with only a constructor and `close()`. It has no `addEventListener`. `tests/app.test.js:123` reaches into `global.EventSource.instances[0].onmessage({ data: ... })` directly. Therefore `eventStream.js` must do `es.onmessage = ...`, `es.onopen = ...`, `es.onerror = ...` and must construct exactly `new EventSource('/events')`.

**2. The secret store must `removeItem`, not overwrite.** `tests/app.test.js:71` asserts `window.localStorage.getItem('arena-secret') === null` after the 401 retry path runs.

**3. `fetch` must be resolved at call time, not captured at module load.** `tests/app.test.js` assigns `global.fetch` *after* importing `App.jsx`. Writing `const f = fetch` at module top level breaks it. Call bare `fetch(...)` inside each function body.

**4. Announcer timing is pinned to the millisecond.** `tests/announcer.test.js` asserts a 2000ms default transmission lead, a 2000ms inter-announcement gap, sample-duration measurement with a 300ms metadata timeout, and that a mapped MP3 sample suppresses the generated stinger. The `await` sequence inside `playOne` must stay in the exact order it is today.

**5. These modules keep their exact public exports.** `lib/engine.js` (`TIERS`, `dayKey`, `createDay`, `applyEvent`, `publicState`), `lib/adapter.js` (`parseWebhook`), `lib/store.js` (`createStore`), `lib/fish-tts.js` (`createFishTts`, `voiceForAnnouncement`, `FISH_TTS_URL`), and `lib/http-server.js` (`createArenaServer`). Their test files must not be edited.

**6. Only one existing test file may be edited: `tests/announcer.test.js`**, and only its harness (Task 12). Its assertions stay byte-identical.

Run the full suite with `npm test`. Run one file with `node --import tsx --test tests/announcer.test.js`.

---

## File Structure

**Phase 1 — domain + guards (pure, zero dependencies)**
- Create `src/domain/time.js` — timestamp formatting for the kill feed.
- Create `src/domain/snapshot.js` — reading agents/services out of a server snapshot, plus the empty-state constant.
- Create `src/domain/announcement.js` — announcement classification: sample key mapping, fallback durations, voice-line derivation.
- Create `src/guards/announcementGuards.js` — `createDedupeGuard`, `announcementId`, `isBigAnnouncement`, `canSpeak`.

**Phase 2 — audio services (adapters over browser APIs)**
- Create `src/services/audio/browserEnv.js` — the single place that touches `window` / `globalThis`.
- Create `src/services/audio/audioElement.js` — Adapter over `HTMLAudioElement`: make, play, stop, measure duration.
- Create `src/services/audio/audioContext.js` — Adapter over `AudioContext`: resume, `tone`, `noiseHit`.
- Create `src/services/audio/stingers.js` — synthesized stinger recipes built on `audioContext`.
- Create `src/services/audio/samples.js` — MP3 sample lookup from the profile.
- Create `src/services/audio/ttsClient.js` — `/api/tts` URL construction and playback.

**Phase 3 — announcer (composition root)**
- Create `src/services/announcer/profile.js` — `DEFAULT_PROFILE`, `mergeProfile`.
- Create `src/services/announcer/queue.js` — serial queue with a configurable gap.
- Create `src/services/announcer/createAnnouncer.js` — wires the above; emits `onShow`/`onHide`.
- Delete `src/lib/announcer.js`.
- Modify `tests/announcer.test.js` — harness only.

**Phase 4 — transport services + hooks**
- Create `src/services/arenaApi.js` — `fetchState`, `postEvent`, `postDevReset`.
- Create `src/services/eventStream.js` — Adapter over `EventSource`, with `JSON.parse` hardening.
- Create `src/hooks/useArenaSnapshot.js`, `src/hooks/useAnnouncementQueue.js`, `src/hooks/useFlipAnimation.js`, `src/hooks/useScoreFlash.js`, `src/hooks/useHotkey.js`.

**Phase 5 — components + actions**
- Create `src/services/ticketIds.js`, `src/services/secretStore.js`.
- Create `src/actions/sendTicketEvent.js`, `src/actions/createTicket.js`, `src/actions/resolveTicket.js`, `src/actions/resetDay.js`.
- Create `src/components/Header.jsx`, `Leaderboard.jsx`, `KillFeed.jsx`, `UnlockGate.jsx`, `AnnouncementOverlay.jsx`, `MiniBanner.jsx`, `TestPanel/TestPanel.jsx`, `TestPanel/TestPanelControls.jsx`, `TestPanel/AgentGrid.jsx`.
- Rewrite `src/App.jsx` as composition only.

**Phase 6 — backend**
- Create `lib/server/http/responses.js`, `lib/server/http/readBody.js`.
- Create `lib/server/guards/webhookSecret.js`, `devOnly.js`, `jsonBody.js`, `ttsConfigured.js`.
- Create `lib/server/services/arenaState.js`, `sseHub.js`, `staticFiles.js`.
- Create `lib/server/actions/ingestEvent.js`, `getState.js`, `tts.js`, `sse.js`, `resetDay.js`, `serveStatic.js`.
- Create `lib/server/router.js`, `lib/server/createArenaServer.js`.
- Modify `lib/http-server.js` → thin re-export.

---

## Task 1: Domain — time formatting

**Files:**
- Create: `src/domain/time.js`
- Test: `tests/domain.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/domain.test.js`:

```js
'use strict';
require('../src/test/setup');
const { test } = require('node:test');
const assert = require('node:assert');

test('fmtTime renders a 24-hour zero-padded clock', async () => {
  const { fmtTime } = await import('../src/domain/time.js');
  const ts = new Date('2026-07-10T09:05:00').getTime();
  assert.strictEqual(fmtTime(ts), '09:05');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/domain.test.js`
Expected: FAIL — `Cannot find module '../src/domain/time.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/domain/time.js`:

```js
export function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/domain.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/time.js tests/domain.test.js
git commit -m "refactor: extract fmtTime into src/domain/time.js"
```

---

## Task 2: Domain — snapshot readers

**Files:**
- Create: `src/domain/snapshot.js`
- Modify: `tests/domain.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/domain.test.js`:

```js
test('servicesFrom falls back to defaults when the snapshot has none', async () => {
  const { servicesFrom, DEFAULT_SERVICES } = await import('../src/domain/snapshot.js');
  assert.deepStrictEqual(servicesFrom(null), DEFAULT_SERVICES);
  assert.deepStrictEqual(servicesFrom({ config: { services: [] } }), DEFAULT_SERVICES);
  assert.deepStrictEqual(servicesFrom({ config: { services: ['KFC'] } }), ['KFC']);
});

test('agentsFrom prefers config, then derives from the leaderboard', async () => {
  const { agentsFrom } = await import('../src/domain/snapshot.js');
  assert.deepStrictEqual(agentsFrom({ config: { agents: ['Alpet'] } }), ['Alpet']);
  assert.deepStrictEqual(
    agentsFrom({ state: { leaderboard: [{ agent: 'Bajram' }, { agent: 'Alpet' }] } }),
    ['Bajram', 'Alpet']
  );
  assert.deepStrictEqual(agentsFrom(null), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/domain.test.js`
Expected: FAIL — `Cannot find module '../src/domain/snapshot.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/domain/snapshot.js`:

```js
export const DEFAULT_SERVICES = ['KFC', 'Prishtina MALL', 'JYSK', 'burgerking', 'comoditahome'];

export const EMPTY_STATE = { leaderboard: [], firstBlood: null, feed: [] };

export function servicesFrom(snapshot) {
  return snapshot?.config?.services?.length ? snapshot.config.services : DEFAULT_SERVICES;
}

export function agentsFrom(snapshot) {
  if (snapshot?.config?.agents?.length) return snapshot.config.agents;
  return (snapshot?.state?.leaderboard || []).map(row => row.agent);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/domain.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/domain/snapshot.js tests/domain.test.js
git commit -m "refactor: extract snapshot readers into src/domain/snapshot.js"
```

---

## Task 3: Domain — announcement classification

**Files:**
- Create: `src/domain/announcement.js`
- Modify: `tests/domain.test.js`

`voiceLine` strips a `"{title}, "` prefix from the line, but only when a mapped MP3 sample already speaks the title. This is the rule that stops the TTS voice from saying "DOUBLE KILL" right after the MP3 said it.

- [ ] **Step 1: Write the failing test**

Append to `tests/domain.test.js`:

```js
test('sampleKey maps tier counts and kinds onto sample names', async () => {
  const { sampleKey } = await import('../src/domain/announcement.js');
  assert.strictEqual(sampleKey({ kind: 'tier', count: 1 }), 'solved');
  assert.strictEqual(sampleKey({ kind: 'tier', count: 15 }), 'monster_kill');
  assert.strictEqual(sampleKey({ kind: 'tier', count: 6 }), 'tier_6');
  assert.strictEqual(sampleKey({ kind: 'first_blood' }), 'first_blood');
  assert.strictEqual(sampleKey({ kind: 'new_ticket' }), 'new_ticket');
});

test('sampleFallbackMs is longer for high tiers', async () => {
  const { sampleFallbackMs } = await import('../src/domain/announcement.js');
  assert.strictEqual(sampleFallbackMs({ kind: 'tier', count: 5 }), 900);
  assert.strictEqual(sampleFallbackMs({ kind: 'tier', count: 2 }), 650);
  assert.strictEqual(sampleFallbackMs({ kind: 'first_blood' }), 650);
});

test('voiceLine strips the title prefix only when a sample already speaks it', async () => {
  const { voiceLine } = await import('../src/domain/announcement.js');
  const a = { title: 'DOUBLE KILL', line: 'DOUBLE KILL, Alpet' };
  assert.strictEqual(voiceLine(a, true), 'Alpet');
  assert.strictEqual(voiceLine(a, false), 'DOUBLE KILL, Alpet');
  assert.strictEqual(voiceLine({ line: 'no title' }, true), 'no title');
  assert.strictEqual(voiceLine({ title: 'X' }, true), '');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/domain.test.js`
Expected: FAIL — `Cannot find module '../src/domain/announcement.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/domain/announcement.js`:

```js
export const SAMPLE_KEYS = {
  first_blood: 'first_blood',
  new_ticket: 'new_ticket',
  1: 'solved',
  2: 'double_kill',
  3: 'triple_kill',
  4: 'killing_spree',
  5: 'unstoppable',
  7: 'rampage',
  10: 'godlike',
  15: 'monster_kill'
};

export function sampleKey(a) {
  if (a.kind === 'tier') return SAMPLE_KEYS[a.count] || `tier_${a.count}`;
  return SAMPLE_KEYS[a.kind] || a.kind;
}

export function sampleFallbackMs(a) {
  return a.kind === 'tier' && a.count >= 5 ? 900 : 650;
}

// When a mapped MP3 already announces the title, the spoken line must not repeat it.
export function voiceLine(a, hasSample) {
  if (!hasSample) return a.line || '';
  if (!a.title || !a.line) return a.line || '';
  const prefix = `${a.title}, `;
  return a.line.startsWith(prefix) ? a.line.slice(prefix.length) : a.line;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/domain.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/domain/announcement.js tests/domain.test.js
git commit -m "refactor: extract announcement classification into src/domain"
```

---

## Task 4: Guards — announcement guards

**Files:**
- Create: `src/guards/announcementGuards.js`
- Test: `tests/guards.test.js`

The dedupe LRU currently lives inline in `App.jsx:265-271`: a `Set` capped at 200 entries, trimmed to the last 100. Preserve those exact numbers — `tests/app.test.js:74` depends on the dedupe behavior.

- [ ] **Step 1: Write the failing test**

Create `tests/guards.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/guards.test.js`
Expected: FAIL — `Cannot find module '../src/guards/announcementGuards.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/guards/announcementGuards.js`:

```js
const SEEN_MAX = 200;
const SEEN_KEEP = 100;

export function announcementId(a) {
  return a.announcementId || `${a.kind}:${a.ticketId || a.line}:${a.ts || ''}`;
}

// Stateful guard: returns true when this announcement has already been played.
// Bounded so a long-running board never grows the set without limit.
export function createDedupeGuard({ max = SEEN_MAX, keep = SEEN_KEEP } = {}) {
  let seen = new Set();
  return function isDuplicate(a) {
    const id = announcementId(a);
    if (seen.has(id)) return true;
    seen.add(id);
    if (seen.size > max) seen = new Set([...seen].slice(-keep));
    return false;
  };
}

export function isBigAnnouncement(a) {
  if (!a) return false;
  return a.kind === 'first_blood' || (a.kind === 'tier' && a.count >= 2);
}

export function canSpeak(profile, text) {
  return Boolean(profile && profile.tts && profile.tts.enabled && text);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/guards.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the full suite to confirm nothing regressed**

Run: `npm test`
Expected: PASS — all files green. Nothing imports the new modules yet.

- [ ] **Step 6: Commit**

```bash
git add src/guards/announcementGuards.js tests/guards.test.js
git commit -m "refactor: extract announcement guards with bounded dedupe LRU"
```

---

## Task 5: Audio — browser environment adapter

**Files:**
- Create: `src/services/audio/browserEnv.js`

This is the only module allowed to reference `window` or `globalThis` directly. Everything downstream asks it for constructors. That is what lets the audio tests run under Node with fake globals.

- [ ] **Step 1: Write the failing test**

Create `tests/audio.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');

test('getAudioCtor prefers window.Audio then falls back to globalThis.Audio', async () => {
  const { getAudioCtor, getWindow } = await import('../src/services/audio/browserEnv.js');
  class WinAudio {}
  global.window = { Audio: WinAudio };
  assert.strictEqual(getAudioCtor(), WinAudio);
  assert.strictEqual(getWindow(), global.window);

  global.window = {};
  class GlobalAudio {}
  global.Audio = GlobalAudio;
  assert.strictEqual(getAudioCtor(), GlobalAudio);

  delete global.window;
  delete global.Audio;
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/audio.test.js`
Expected: FAIL — `Cannot find module '../src/services/audio/browserEnv.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/services/audio/browserEnv.js`:

```js
export function getWindow() {
  return typeof window === 'undefined' ? {} : window;
}

export function getAudioCtor() {
  const win = getWindow();
  return win.Audio || globalThis.Audio;
}

export function getAudioContextCtor() {
  const win = getWindow();
  return win.AudioContext || win.webkitAudioContext;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/audio.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/audio/browserEnv.js tests/audio.test.js
git commit -m "refactor: add browserEnv adapter as the sole window access point"
```

---

## Task 6: Audio — HTMLAudioElement adapter

**Files:**
- Create: `src/services/audio/audioElement.js`
- Modify: `tests/audio.test.js`

`measuredAudioMs` resolves immediately if `duration` is already known, otherwise races `loadedmetadata` / `error` against a 300ms timeout, falling back to a caller-supplied duration. Keep all three paths.

- [ ] **Step 1: Write the failing test**

Append to `tests/audio.test.js`:

```js
test('makeAudio returns null without a src or without an Audio constructor', async () => {
  const { makeAudio } = await import('../src/services/audio/audioElement.js');
  global.window = { Audio: class { constructor(src) { this.src = src; } } };
  assert.strictEqual(makeAudio(''), null);

  global.window = {};
  delete global.Audio;
  assert.strictEqual(makeAudio('/a.mp3'), null);
  delete global.window;
});

test('measuredAudioMs resolves a known duration immediately', async () => {
  const { measuredAudioMs } = await import('../src/services/audio/audioElement.js');
  assert.strictEqual(await measuredAudioMs({ duration: 1.234 }, 650), 1234);
});

test('measuredAudioMs returns 0 for a missing audio element', async () => {
  const { measuredAudioMs } = await import('../src/services/audio/audioElement.js');
  assert.strictEqual(await measuredAudioMs(null, 650), 0);
});

test('measuredAudioMs falls back after the metadata timeout', async () => {
  const { measuredAudioMs } = await import('../src/services/audio/audioElement.js');
  const audio = { duration: NaN, addEventListener() {}, load() {} };
  assert.strictEqual(await measuredAudioMs(audio, 777), 777);
});

test('playAudio swallows a rejected play promise and reports that it started', async () => {
  const { playAudio } = await import('../src/services/audio/audioElement.js');
  const audio = { play: () => Promise.reject(new Error('blocked')) };
  assert.strictEqual(playAudio(audio), true);
  assert.strictEqual(playAudio(null), false);
});

test('stopAudio tolerates a read-only currentTime', async () => {
  const { stopAudio } = await import('../src/services/audio/audioElement.js');
  let paused = false;
  const audio = { pause() { paused = true; }, set currentTime(_) { throw new Error('read-only'); } };
  assert.doesNotThrow(() => stopAudio(audio));
  assert.strictEqual(paused, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/audio.test.js`
Expected: FAIL — `Cannot find module '../src/services/audio/audioElement.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/services/audio/audioElement.js`:

```js
import { getAudioCtor } from './browserEnv.js';

export const AUDIO_METADATA_TIMEOUT_MS = 300;

export function makeAudio(src, { volume = 1, loop = false } = {}) {
  const AudioCtor = getAudioCtor();
  if (!src || typeof AudioCtor === 'undefined') return null;
  const audio = new AudioCtor(src);
  audio.volume = volume;
  audio.loop = loop;
  return audio;
}

export function stopAudio(audio) {
  if (!audio) return;
  if (audio.pause) audio.pause();
  try {
    audio.currentTime = 0;
  } catch (_) {
    // Some test/browser audio implementations expose currentTime as read-only.
  }
}

export function playAudio(audio) {
  if (!audio) return false;
  const started = audio.play();
  // Browsers reject play() for autoplay policy reasons the app cannot act on.
  if (started && started.catch) started.catch(() => {});
  return true;
}

export function measuredAudioMs(audio, fallbackMs) {
  return new Promise(resolve => {
    if (!audio) return resolve(0);
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      return resolve(Math.round(audio.duration * 1000));
    }

    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      const durationMs = Number.isFinite(audio.duration) && audio.duration > 0
        ? Math.round(audio.duration * 1000)
        : fallbackMs;
      resolve(durationMs);
    };

    if (audio.addEventListener) {
      audio.addEventListener('loadedmetadata', done, { once: true });
      audio.addEventListener('error', done, { once: true });
    } else {
      audio.onloadedmetadata = done;
      audio.onerror = done;
    }

    if (audio.load) audio.load();
    setTimeout(done, AUDIO_METADATA_TIMEOUT_MS);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/audio.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/audio/audioElement.js tests/audio.test.js
git commit -m "refactor: extract HTMLAudioElement adapter"
```

---

## Task 7: Audio — AudioContext adapter

**Files:**
- Create: `src/services/audio/audioContext.js`
- Modify: `tests/audio.test.js`

`tone` and `noiseHit` are no-ops until `resume()` has been called, exactly as today (`if (!ctx) return`).

- [ ] **Step 1: Write the failing test**

Append to `tests/audio.test.js`:

```js
test('audioContext is not ready until resume, and tone is a no-op before that', async () => {
  const { createAudioContext } = await import('../src/services/audio/audioContext.js');
  let constructed = 0;
  global.window = {
    AudioContext: class {
      constructor() {
        constructed += 1;
        this.currentTime = 0;
        this.sampleRate = 44100;
        this.destination = {};
      }
      resume() {}
      createOscillator() {
        return {
          frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
          connect() { return this; }, start() {}, stop() {}
        };
      }
      createGain() {
        return {
          gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
          connect() { return this; }
        };
      }
    }
  };

  const engine = createAudioContext();
  assert.strictEqual(engine.isReady(), false);
  assert.doesNotThrow(() => engine.tone(440, 0, 0.1));
  assert.strictEqual(constructed, 0);

  engine.resume();
  assert.strictEqual(engine.isReady(), true);
  assert.strictEqual(constructed, 1);

  engine.resume();
  assert.strictEqual(constructed, 1, 'resume must not construct a second context');

  assert.doesNotThrow(() => engine.tone(440, 0, 0.1, { slideTo: 220 }));
  delete global.window;
});

test('createAudioContext survives a browser with no AudioContext', async () => {
  const { createAudioContext } = await import('../src/services/audio/audioContext.js');
  global.window = {};
  const engine = createAudioContext();
  assert.doesNotThrow(() => engine.resume());
  assert.strictEqual(engine.isReady(), false);
  delete global.window;
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/audio.test.js`
Expected: FAIL — `Cannot find module '../src/services/audio/audioContext.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/services/audio/audioContext.js`:

```js
import { getAudioContextCtor } from './browserEnv.js';

export function createAudioContext() {
  let ctx = null;

  function resume() {
    const AudioContextCtor = getAudioContextCtor();
    if (AudioContextCtor && !ctx) ctx = new AudioContextCtor();
    if (ctx && ctx.resume) ctx.resume();
  }

  function isReady() {
    return Boolean(ctx);
  }

  function tone(freq, start, dur, { type = 'square', gain = 0.18, slideTo = null } = {}) {
    if (!ctx) return;
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
    if (!ctx) return;
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

  return { resume, isReady, tone, noiseHit };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/audio.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/audio/audioContext.js tests/audio.test.js
git commit -m "refactor: extract AudioContext adapter"
```

---

## Task 8: Audio — stingers

**Files:**
- Create: `src/services/audio/stingers.js`
- Modify: `tests/audio.test.js`

Each stinger returns its duration in milliseconds. The announcer uses that number to decide how long to wait before speaking. Those numbers are load-bearing.

- [ ] **Step 1: Write the failing test**

Append to `tests/audio.test.js`:

```js
test('stingers return their advertised durations', async () => {
  const { createStingers } = await import('../src/services/audio/stingers.js');
  const calls = [];
  const engine = {
    isReady: () => true,
    tone: (...args) => calls.push(['tone', ...args]),
    noiseHit: (...args) => calls.push(['noise', ...args])
  };
  const stingers = createStingers(engine);

  assert.strictEqual(stingers.blip(), 260);
  assert.strictEqual(stingers.solved(), 480);
  assert.strictEqual(stingers.firstBlood(), 1400);
  // tier(2): endAt = 0.08 + 2 * 0.09 = 0.26 -> round((0.26 + 0.6) * 1000) = 860
  assert.strictEqual(stingers.tier(2), 860);
  // tier(10) clamps notes to 8: endAt = 0.08 + 8 * 0.09 = 0.80 -> 1400
  assert.strictEqual(stingers.tier(10), 1400);
  assert.ok(calls.length > 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/audio.test.js`
Expected: FAIL — `Cannot find module '../src/services/audio/stingers.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/services/audio/stingers.js`:

```js
export function createStingers(engine) {
  const { tone, noiseHit } = engine;

  return {
    blip() {
      tone(980, 0, 0.08, { type: 'square', gain: 0.12 });
      tone(1960, 0.08, 0.1, { type: 'square', gain: 0.08 });
      return 260;
    },
    solved() {
      noiseHit(0, 0.18, 0.18);
      tone(110, 0, 0.28, { type: 'sawtooth', gain: 0.2, slideTo: 70 });
      tone(440, 0.08, 0.18, { type: 'square', gain: 0.12 });
      return 480;
    },
    firstBlood() {
      noiseHit(0, 0.5, 0.3);
      tone(150, 0, 0.7, { type: 'sawtooth', gain: 0.28, slideTo: 40 });
      tone(75, 0.25, 0.9, { type: 'sawtooth', gain: 0.22, slideTo: 30 });
      noiseHit(0.55, 0.35, 0.18);
      return 1400;
    },
    tier(count) {
      noiseHit(0, 0.45, count >= 5 ? 0.32 : 0.22);
      tone(72, 0, 0.8, { type: 'sawtooth', gain: count >= 5 ? 0.3 : 0.22, slideTo: 42 });
      const notes = Math.min(count, 8);
      const base = 330;
      for (let i = 0; i < notes; i++) {
        tone(base * Math.pow(1.2, i), 0.08 + i * 0.09, 0.12, { gain: 0.14 });
      }
      const endAt = 0.08 + notes * 0.09;
      tone(base * Math.pow(1.2, notes), endAt, 0.5, { type: 'sawtooth', gain: 0.2 });
      tone(base * Math.pow(1.2, notes) * 1.5, endAt, 0.5, { type: 'sawtooth', gain: 0.12 });
      if (count >= 5) noiseHit(endAt, 0.4, 0.2);
      return Math.round((endAt + 0.6) * 1000);
    }
  };
}

// Strategy: which stinger (if any) plays for an announcement.
// A mapped MP3 sample always wins over a generated stinger.
export function selectStinger(stingers, a, hasSample) {
  if (hasSample) return null;
  if (a.kind === 'first_blood') return () => stingers.firstBlood();
  if (a.kind === 'new_ticket') return null;
  if (a.kind === 'tier') return a.count >= 2 ? () => stingers.tier(a.count) : () => stingers.solved();
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/audio.test.js`
Expected: PASS (10 tests)

- [ ] **Step 5: Add a test for the selection strategy**

Append to `tests/audio.test.js`:

```js
test('selectStinger suppresses generated audio when a sample exists', async () => {
  const { selectStinger } = await import('../src/services/audio/stingers.js');
  const stingers = { firstBlood: () => 1400, tier: () => 860, solved: () => 480 };

  assert.strictEqual(selectStinger(stingers, { kind: 'first_blood' }, true), null);
  assert.strictEqual(selectStinger(stingers, { kind: 'new_ticket' }, false), null);
  assert.strictEqual(selectStinger(stingers, { kind: 'unknown' }, false), null);
  assert.strictEqual(selectStinger(stingers, { kind: 'first_blood' }, false)(), 1400);
  assert.strictEqual(selectStinger(stingers, { kind: 'tier', count: 3 }, false)(), 860);
  assert.strictEqual(selectStinger(stingers, { kind: 'tier', count: 1 }, false)(), 480);
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --import tsx --test tests/audio.test.js`
Expected: PASS (11 tests)

- [ ] **Step 7: Commit**

```bash
git add src/services/audio/stingers.js tests/audio.test.js
git commit -m "refactor: extract stingers and sample-vs-stinger strategy"
```

---

## Task 9: Audio — samples

**Files:**
- Create: `src/services/audio/samples.js`
- Modify: `tests/audio.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/audio.test.js`:

```js
test('createSample builds an audio element only when the profile maps the key', async () => {
  const { createSample } = await import('../src/services/audio/samples.js');
  global.window = { Audio: class { constructor(src) { this.src = src; } } };

  const profile = { samples: { double_kill: '/sound/DoubleKill.mp3' }, sampleVolume: 0.9 };
  const audio = createSample({ kind: 'tier', count: 2 }, profile);
  assert.strictEqual(audio.src, '/sound/DoubleKill.mp3');
  assert.strictEqual(audio.volume, 0.9);

  assert.strictEqual(createSample({ kind: 'tier', count: 3 }, profile), null);
  assert.strictEqual(createSample({ kind: 'tier', count: 2 }, { samples: {} }), null);
  delete global.window;
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/audio.test.js`
Expected: FAIL — `Cannot find module '../src/services/audio/samples.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/services/audio/samples.js`:

```js
import { sampleKey } from '../../domain/announcement.js';
import { makeAudio } from './audioElement.js';

export function createSample(a, profile) {
  const src = profile.samples && profile.samples[sampleKey(a)];
  return makeAudio(src, { volume: profile.sampleVolume });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/audio.test.js`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/audio/samples.js tests/audio.test.js
git commit -m "refactor: extract sample lookup service"
```

---

## Task 10: Audio — TTS client

**Files:**
- Create: `src/services/audio/ttsClient.js`
- Modify: `tests/audio.test.js`

`playAiVoice` resolves `true` only when the audio reaches `onended`. Timeout, error, and a rejected `play()` all resolve `false`, and the announcer continues regardless.

- [ ] **Step 1: Write the failing test**

Append to `tests/audio.test.js`:

```js
test('ttsUrl encodes the spoken line, kind, title, and optional count', async () => {
  const { ttsUrl } = await import('../src/services/audio/ttsClient.js');
  const url = ttsUrl({ kind: 'tier', count: 2, title: 'DOUBLE KILL', line: 'DOUBLE KILL, Alpet' }, true);
  const params = new URL(url, 'http://x').searchParams;
  assert.strictEqual(params.get('text'), 'Alpet');
  assert.strictEqual(params.get('kind'), 'tier');
  assert.strictEqual(params.get('title'), 'DOUBLE KILL');
  assert.strictEqual(params.get('count'), '2');

  const noCount = ttsUrl({ kind: 'new_ticket', title: 'NEW TICKET', line: 'New ticket by Alpet' }, false);
  assert.strictEqual(new URL(noCount, 'http://x').searchParams.get('count'), null);
});

test('playAiVoice resolves false when tts is disabled or the line is empty', async () => {
  const { playAiVoice } = await import('../src/services/audio/ttsClient.js');
  assert.strictEqual(await playAiVoice({ kind: 'x', line: 'hi' }, false, { tts: { enabled: false } }), false);
  assert.strictEqual(await playAiVoice({ kind: 'x', line: '' }, false, { tts: { enabled: true } }), false);
});

test('playAiVoice resolves true when the audio finishes', async () => {
  const { playAiVoice } = await import('../src/services/audio/ttsClient.js');
  global.window = {
    Audio: class {
      constructor(src) { this.src = src; }
      play() { setTimeout(() => this.onended(), 0); return Promise.resolve(); }
    }
  };
  const ok = await playAiVoice({ kind: 'x', line: 'hi' }, false, { tts: { enabled: true, volume: 1 } });
  assert.strictEqual(ok, true);
  delete global.window;
});

test('playAiVoice resolves false when the audio errors', async () => {
  const { playAiVoice } = await import('../src/services/audio/ttsClient.js');
  global.window = {
    Audio: class {
      constructor(src) { this.src = src; }
      play() { setTimeout(() => this.onerror(), 0); return Promise.resolve(); }
    }
  };
  const ok = await playAiVoice({ kind: 'x', line: 'hi' }, false, { tts: { enabled: true } });
  assert.strictEqual(ok, false);
  delete global.window;
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/audio.test.js`
Expected: FAIL — `Cannot find module '../src/services/audio/ttsClient.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/services/audio/ttsClient.js`:

```js
import { voiceLine } from '../../domain/announcement.js';
import { canSpeak } from '../../guards/announcementGuards.js';
import { makeAudio } from './audioElement.js';

const DEFAULT_TTS_TIMEOUT_MS = 9000;

export function ttsUrl(a, hasSample) {
  const params = new URLSearchParams({
    text: voiceLine(a, hasSample),
    kind: a.kind || '',
    title: a.title || ''
  });
  if (a.count !== undefined) params.set('count', String(a.count));
  return `/api/tts?${params.toString()}`;
}

export function playAiVoice(a, hasSample, profile) {
  return new Promise(resolve => {
    const text = voiceLine(a, hasSample);
    if (!canSpeak(profile, text)) return resolve(false);

    const audio = makeAudio(ttsUrl(a, hasSample), { volume: profile.tts.volume ?? 1 });
    if (!audio) return resolve(false);

    let finished = false;
    const done = ok => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), profile.tts.timeoutMs || DEFAULT_TTS_TIMEOUT_MS);
    audio.onended = () => done(true);
    audio.onerror = () => done(false);
    const started = audio.play();
    if (started && started.catch) started.catch(() => done(false));
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/audio.test.js`
Expected: PASS (16 tests)

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS. `src/lib/announcer.js` is still the live implementation; the new services are not wired in yet.

- [ ] **Step 6: Commit**

```bash
git add src/services/audio/ttsClient.js tests/audio.test.js
git commit -m "refactor: extract TTS client service"
```

---

## Task 11: Announcer — profile and queue

**Files:**
- Create: `src/services/announcer/profile.js`
- Create: `src/services/announcer/queue.js`
- Test: `tests/announcer-queue.test.js`

The queue reproduces `playNext` exactly: a re-entrant call while playing is a no-op, and the next item is scheduled `gapMs` after the previous one finishes.

- [ ] **Step 1: Write the failing test**

Create `tests/announcer-queue.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');

const wait = ms => new Promise(r => setTimeout(r, ms));

test('mergeProfile deep-merges voice, samples and tts but replaces transmission', async () => {
  const { mergeProfile, DEFAULT_PROFILE } = await import('../src/services/announcer/profile.js');
  const merged = mergeProfile({ voice: { rate: 1 }, tts: { enabled: true }, transmission: { src: '/t.mp3' } });
  assert.strictEqual(merged.voice.rate, 1);
  assert.strictEqual(merged.voice.pitch, DEFAULT_PROFILE.voice.pitch);
  assert.strictEqual(merged.tts.enabled, true);
  assert.strictEqual(merged.tts.timeoutMs, 9000);
  assert.deepStrictEqual(merged.transmission, { src: '/t.mp3' });
  assert.strictEqual(merged.background, null);
});

test('mergeProfile with no argument returns the defaults', async () => {
  const { mergeProfile, DEFAULT_PROFILE } = await import('../src/services/announcer/profile.js');
  assert.deepStrictEqual(mergeProfile(), DEFAULT_PROFILE);
});

test('queue plays items serially with a gap between them', async () => {
  const { createQueue } = await import('../src/services/announcer/queue.js');
  const order = [];
  const queue = createQueue({
    gapMs: 30,
    async playOne(item) {
      order.push(`start:${item}`);
      await wait(20);
      order.push(`end:${item}`);
    }
  });

  queue.enqueue('a');
  queue.enqueue('b');
  await wait(150);

  assert.deepStrictEqual(order, ['start:a', 'end:a', 'start:b', 'end:b']);
});

test('queue keeps draining after playOne throws', async () => {
  const { createQueue } = await import('../src/services/announcer/queue.js');
  const seen = [];
  const queue = createQueue({
    gapMs: 10,
    async playOne(item) {
      seen.push(item);
      if (item === 'a') throw new Error('boom');
    }
  });

  queue.enqueue('a');
  queue.enqueue('b');
  await wait(100);

  assert.deepStrictEqual(seen, ['a', 'b']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/announcer-queue.test.js`
Expected: FAIL — `Cannot find module '../src/services/announcer/profile.js'`

- [ ] **Step 3: Write the profile module**

Create `src/services/announcer/profile.js`:

```js
export const DEFAULT_PROFILE = {
  voice: {
    rate: 0.82,
    pitch: 0.35,
    volume: 1,
    preferredVoices: ['Microsoft David', 'Google US English', 'Daniel', 'Alex']
  },
  background: null,
  transmission: null,
  tts: { enabled: false, volume: 1, timeoutMs: 9000 },
  samples: {},
  sampleVolume: 0.9
};

export function mergeProfile(next = {}) {
  return {
    ...DEFAULT_PROFILE,
    ...next,
    voice: { ...DEFAULT_PROFILE.voice, ...(next.voice || {}) },
    samples: { ...DEFAULT_PROFILE.samples, ...(next.samples || {}) },
    tts: { ...DEFAULT_PROFILE.tts, ...(next.tts || {}) },
    transmission: next.transmission === undefined ? DEFAULT_PROFILE.transmission : next.transmission,
    background: next.background === undefined ? DEFAULT_PROFILE.background : next.background
  };
}
```

- [ ] **Step 4: Write the queue module**

Create `src/services/announcer/queue.js`:

```js
export function createQueue({ gapMs, playOne }) {
  const items = [];
  let playing = false;

  async function pump() {
    if (playing) return;
    const item = items.shift();
    if (!item) return;
    playing = true;
    try {
      await playOne(item);
    } finally {
      playing = false;
      if (items.length) setTimeout(pump, gapMs);
    }
  }

  return {
    enqueue(item) {
      items.push(item);
      pump();
    },
    get size() {
      return items.length;
    }
  };
}
```

Note: `pump` swallows nothing — a throwing `playOne` still runs the `finally`, which is why the fourth test drains `b`. The rejected promise from `pump()` inside `enqueue` is unhandled by design, matching today's fire-and-forget `playNext()` call.

- [ ] **Step 5: Run test to verify it passes**

Run: `node --import tsx --test tests/announcer-queue.test.js`
Expected: PASS (4 tests)

If the fourth test reports an unhandled rejection, change `enqueue` to `pump().catch(() => {})` and add a one-line comment: `// playOne errors are already contained by its own finally; nothing upstream can act on them.`

- [ ] **Step 6: Commit**

```bash
git add src/services/announcer/profile.js src/services/announcer/queue.js tests/announcer-queue.test.js
git commit -m "refactor: extract announcer profile and serial queue"
```

---

## Task 12: Announcer — composition root (highest risk)

**Files:**
- Create: `src/services/announcer/createAnnouncer.js`
- Delete: `src/lib/announcer.js`
- Modify: `tests/announcer.test.js` (harness only)

This is the task that replaces `getOverlayElements` with `onShow`/`onHide`. The `await` order inside `playOne` is copied verbatim from `playNext` in `src/lib/announcer.js:298-323`. Do not reorder it.

- [ ] **Step 1: Write the new module**

Create `src/services/announcer/createAnnouncer.js`:

```js
import { sampleFallbackMs } from '../../domain/announcement.js';
import { makeAudio, playAudio, stopAudio, measuredAudioMs } from '../audio/audioElement.js';
import { createAudioContext } from '../audio/audioContext.js';
import { createStingers, selectStinger } from '../audio/stingers.js';
import { createSample } from '../audio/samples.js';
import { playAiVoice } from '../audio/ttsClient.js';
import { DEFAULT_PROFILE, mergeProfile } from './profile.js';
import { createQueue } from './queue.js';

const GAP_MS = 2000;
const DEFAULT_TRANSMISSION_LEAD_MS = 2000;
const TAIL_MS = 400;

const delay = ms => new Promise(r => setTimeout(r, ms));

export function createAnnouncer({ onShow = () => {}, onHide = () => {} } = {}) {
  const engine = createAudioContext();
  const stingers = createStingers(engine);
  let profile = DEFAULT_PROFILE;
  let backgroundAudio = null;

  function configure(next) {
    profile = mergeProfile(next);
    if (backgroundAudio && profile.background && backgroundAudio.src !== profile.background.src) {
      backgroundAudio.pause();
      backgroundAudio = null;
    }
  }

  function startBackground() {
    const bg = profile.background;
    if (!bg || backgroundAudio) return;
    backgroundAudio = makeAudio(bg.src, { volume: bg.volume ?? 0.25, loop: bg.loop !== false });
    if (!backgroundAudio) return;
    playAudio(backgroundAudio);
  }

  function startTransmission() {
    const tx = profile.transmission;
    if (!tx) return null;
    const audio = makeAudio(tx.src, { volume: tx.volume ?? 0.15, loop: tx.loop !== false });
    if (!audio) return null;
    playAudio(audio);
    return audio;
  }

  function unlock() {
    engine.resume();
    startBackground();
  }

  function playStinger(a, hasSample) {
    if (!engine.isReady()) return 0;
    const play = selectStinger(stingers, a, hasSample);
    return play ? play() : 0;
  }

  async function playOne(a) {
    let transmissionAudio = null;
    try {
      onShow(a);
      const sampleAudio = createSample(a, profile);
      const hasSample = Boolean(sampleAudio);
      const sampleMs = await measuredAudioMs(sampleAudio, sampleFallbackMs(a));
      transmissionAudio = startTransmission();
      const leadMs = transmissionAudio ? profile.transmission.leadMs ?? DEFAULT_TRANSMISSION_LEAD_MS : 0;
      if (leadMs) await delay(leadMs);
      playAudio(sampleAudio);
      const stingerMs = playStinger(a, hasSample);
      await delay(Math.max(sampleMs, stingerMs));
      await playAiVoice(a, hasSample, profile);
      await delay(TAIL_MS);
    } finally {
      stopAudio(transmissionAudio);
      onHide();
    }
  }

  const queue = createQueue({ gapMs: GAP_MS, playOne });

  return {
    configure,
    unlock,
    enqueue: queue.enqueue
  };
}
```

- [ ] **Step 2: Update the test harness**

In `tests/announcer.test.js`, delete the `elements()` function (lines 5-20) and replace `loadAnnouncer` (lines 62-75) with:

```js
async function loadAnnouncer(overrides = {}) {
  installAudioContext();
  if (overrides.AudioContext) {
    global.window.AudioContext = overrides.AudioContext;
  }
  global.window.speechSynthesis = overrides.speechSynthesis;
  global.window.SpeechSynthesisUtterance = overrides.SpeechSynthesisUtterance;
  global.Audio = overrides.Audio;
  global.window.Audio = overrides.Audio;
  const announcerModule = await import('../src/services/announcer/createAnnouncer.js');
  const createAnnouncer = announcerModule.createAnnouncer || announcerModule.default.createAnnouncer;
  return createAnnouncer({ onShow: () => {}, onHide: () => {} });
}
```

Change nothing else in the file. Every `test(...)` block and every `assert` stays byte-identical.

- [ ] **Step 3: Run the announcer tests**

Run: `node --import tsx --test tests/announcer.test.js`
Expected: PASS — all 12 tests.

If the "waits 2 seconds before starting the mapped event sample" test fails, the `await` order in `playOne` was changed. Compare against `src/lib/announcer.js:298-323` line by line before touching anything else.

- [ ] **Step 4: Delete the old module**

```bash
git rm src/lib/announcer.js
```

`src/App.jsx` still imports it. Update that one import line:

```js
import { createAnnouncer } from './services/announcer/createAnnouncer.js';
```

And in `App.jsx`, replace the `useMemo` at lines 223-230 with:

```js
  const announcer = useMemo(() => createAnnouncer({
    onShow: a => showBannerImperative(a, { overlayRef, overlayTitleRef, overlayLineRef, miniRef }),
    onHide: () => hideBannersImperative({ overlayRef, miniRef })
  }), []);
```

and add these two temporary bridge functions to the top of `App.jsx`. They exist only until Task 17 deletes them along with the refs.

```js
// Temporary bridge: keeps the DOM banners working until hooks + components land in Task 17.
function showBannerImperative(a, refs) {
  const big = a.kind === 'first_blood' || (a.kind === 'tier' && a.count >= 2);
  if (big && refs.overlayRef.current && refs.overlayTitleRef.current && refs.overlayLineRef.current) {
    refs.overlayTitleRef.current.textContent = a.title;
    refs.overlayLineRef.current.textContent = a.line;
    refs.overlayRef.current.classList.toggle('gold', a.kind === 'tier' && a.count >= 5);
    refs.overlayRef.current.classList.remove('hidden');
  } else if (refs.miniRef.current) {
    refs.miniRef.current.textContent = `${a.title} - ${a.line}`;
    refs.miniRef.current.classList.remove('hidden');
  }
}

function hideBannersImperative(refs) {
  if (refs.overlayRef.current) refs.overlayRef.current.classList.add('hidden');
  if (refs.miniRef.current) refs.miniRef.current.classList.add('hidden');
}
```

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — every file, including `tests/app.test.js`.

- [ ] **Step 6: Commit**

```bash
git add -A src/services/announcer src/lib src/App.jsx tests/announcer.test.js
git commit -m "refactor: announcer becomes a DOM-free service emitting onShow/onHide"
```

---

## Task 13: Services — arena API

**Files:**
- Create: `src/services/arenaApi.js`
- Test: `tests/arena-api.test.js`

Call `fetch` bare inside each function. Do not hoist it (Critical Constraint 3).

- [ ] **Step 1: Write the failing test**

Create `tests/arena-api.test.js`:

```js
'use strict';
require('../src/test/setup');
const { test } = require('node:test');
const assert = require('node:assert');

test('fetchState parses the snapshot and swallows transport failures', async () => {
  const { fetchState } = await import('../src/services/arenaApi.js');

  global.fetch = () => Promise.resolve({ json: () => Promise.resolve({ day: '2026-07-10' }) });
  assert.deepStrictEqual(await fetchState(), { day: '2026-07-10' });

  global.fetch = () => Promise.reject(new Error('offline'));
  assert.strictEqual(await fetchState(), null);
  delete global.fetch;
});

test('postEvent sends the webhook secret header', async () => {
  const { postEvent } = await import('../src/services/arenaApi.js');
  let seen;
  global.fetch = (url, options) => { seen = { url, options }; return Promise.resolve({ ok: true, status: 200 }); };

  await postEvent({ type: 'ticket.created', agent: 'Alpet' }, 'sekret');

  assert.strictEqual(seen.url, '/api/events');
  assert.strictEqual(seen.options.method, 'POST');
  assert.strictEqual(seen.options.headers['X-Webhook-Secret'], 'sekret');
  assert.strictEqual(seen.options.headers['Content-Type'], 'application/json');
  assert.deepStrictEqual(JSON.parse(seen.options.body), { type: 'ticket.created', agent: 'Alpet' });
  delete global.fetch;
});

test('postDevReset posts to the dev route', async () => {
  const { postDevReset } = await import('../src/services/arenaApi.js');
  let seen;
  global.fetch = (url, options) => { seen = { url, options }; return Promise.resolve({ ok: true }); };
  await postDevReset();
  assert.strictEqual(seen.url, '/api/dev/reset');
  assert.strictEqual(seen.options.method, 'POST');
  delete global.fetch;
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/arena-api.test.js`
Expected: FAIL — `Cannot find module '../src/services/arenaApi.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/services/arenaApi.js`:

```js
// `fetch` is referenced bare so tests can swap `global.fetch` after this module loads.

export async function fetchState() {
  try {
    const res = await fetch('/api/state');
    return await res.json();
  } catch (_) {
    // A failed snapshot fetch is not actionable: SSE will deliver the next one.
    return null;
  }
}

export function postEvent(payload, secret) {
  return fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': secret },
    body: JSON.stringify(payload)
  });
}

export function postDevReset() {
  return fetch('/api/dev/reset', { method: 'POST' });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/arena-api.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/arenaApi.js tests/arena-api.test.js
git commit -m "refactor: extract arenaApi transport service"
```

---

## Task 14: Services — event stream adapter

**Files:**
- Create: `src/services/eventStream.js`
- Test: `tests/event-stream.test.js`

Assign `onopen` / `onmessage` / `onerror` as properties (Critical Constraint 1). This module is also where the `JSON.parse` hardening lands: today a malformed SSE frame throws inside the `EventSource` callback and kills announcement processing for that frame.

- [ ] **Step 1: Write the failing test**

Create `tests/event-stream.test.js`:

```js
'use strict';
require('../src/test/setup');
const { test, afterEach } = require('node:test');
const assert = require('node:assert');

afterEach(() => global.__resetBrowserMocks());

test('subscribe opens /events and forwards parsed frames', async () => {
  const { subscribe } = await import('../src/services/eventStream.js');
  const frames = [];
  const opens = [];

  const unsubscribe = subscribe({
    onOpen: () => opens.push(true),
    onMessage: msg => frames.push(msg),
    onError: () => {}
  });

  const es = global.EventSource.instances[0];
  assert.strictEqual(es.url, '/events');

  es.onopen();
  es.onmessage({ data: JSON.stringify({ day: '2026-07-10' }) });

  assert.deepStrictEqual(opens, [true]);
  assert.deepStrictEqual(frames, [{ day: '2026-07-10' }]);

  unsubscribe();
  assert.strictEqual(es.closed, true);
});

test('a malformed frame is dropped without throwing or stopping later frames', async () => {
  const { subscribe } = await import('../src/services/eventStream.js');
  const frames = [];
  subscribe({ onMessage: msg => frames.push(msg) });

  const es = global.EventSource.instances[0];
  assert.doesNotThrow(() => es.onmessage({ data: 'not json{' }));
  es.onmessage({ data: JSON.stringify({ ok: true }) });

  assert.deepStrictEqual(frames, [{ ok: true }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/event-stream.test.js`
Expected: FAIL — `Cannot find module '../src/services/eventStream.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/services/eventStream.js`:

```js
// Adapter over EventSource. Handlers are assigned as properties, not via
// addEventListener, because the test harness's MockEventSource only exposes properties.
export function subscribe({ onOpen = () => {}, onMessage = () => {}, onError = () => {} } = {}) {
  const es = new EventSource('/events');

  es.onopen = () => onOpen();
  es.onerror = () => onError();
  es.onmessage = event => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch (_) {
      // A malformed frame must not kill the stream's handler for subsequent frames.
      return;
    }
    onMessage(msg);
  };

  return function unsubscribe() {
    if (es.close) es.close();
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/event-stream.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/eventStream.js tests/event-stream.test.js
git commit -m "refactor: extract EventSource adapter with malformed-frame hardening"
```

---

## Task 15: Hooks — snapshot, announcements, animation

**Files:**
- Create: `src/hooks/useArenaSnapshot.js`
- Create: `src/hooks/useAnnouncementQueue.js`
- Create: `src/hooks/useFlipAnimation.js`
- Create: `src/hooks/useScoreFlash.js`
- Create: `src/hooks/useHotkey.js`

These are exercised through `tests/app.test.js` in Task 17. They get no standalone test file — testing a hook in isolation would need a renderer harness that adds no coverage beyond what the component test already gives.

**Ordering constraint:** `useArenaSnapshot`'s `onBeforeApply` must run `captureOldTops()` *before* `setSnapshot`, because FLIP needs the pre-render row positions. That is why `useFlipAnimation` returns a callback rather than taking `snapshot` as an argument — taking `snapshot` would make the two hooks circular.

- [ ] **Step 1: Write `useHotkey`**

Create `src/hooks/useHotkey.js`:

```js
import { useEffect } from 'react';

export function useHotkey(key, handler) {
  useEffect(() => {
    function onKeyDown(event) {
      const tag = document.activeElement?.tagName;
      if (event.key.toLowerCase() === key && tag !== 'INPUT') handler();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [key, handler]);
}
```

- [ ] **Step 2: Write `useArenaSnapshot`**

Create `src/hooks/useArenaSnapshot.js`:

```js
import { useEffect, useRef, useState } from 'react';
import { fetchState } from '../services/arenaApi.js';
import { subscribe } from '../services/eventStream.js';

export function useArenaSnapshot({ onBeforeApply, onMessage }) {
  const [snapshot, setSnapshot] = useState(null);
  const [live, setLive] = useState(false);
  const onBeforeApplyRef = useRef(onBeforeApply);
  const onMessageRef = useRef(onMessage);

  onBeforeApplyRef.current = onBeforeApply;
  onMessageRef.current = onMessage;

  useEffect(() => {
    let cancelled = false;

    function apply(next) {
      if (cancelled || !next) return;
      onBeforeApplyRef.current?.(next);
      setSnapshot(next);
    }

    fetchState().then(apply);

    const unsubscribe = subscribe({
      onOpen: () => {
        setLive(true);
        fetchState().then(apply);
      },
      onError: () => setLive(false),
      onMessage: msg => {
        onMessageRef.current?.(msg);
        apply(msg);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return { snapshot, live };
}
```

Note the ref indirection: the effect must run exactly once (one `EventSource` per mount), but the callbacks close over `announcer` and other values that change identity across renders. Storing them in refs keeps the effect's dependency array empty without capturing stale closures.

Ordering note: `onMessage` runs before `apply` so `dayRolled` can reset the score baseline before the new snapshot renders — matching `App.jsx:262-263` today.

- [ ] **Step 3: Write `useAnnouncementQueue`**

Create `src/hooks/useAnnouncementQueue.js`:

```js
import { useCallback, useMemo, useRef, useState } from 'react';
import { createAnnouncer } from '../services/announcer/createAnnouncer.js';
import { createDedupeGuard } from '../guards/announcementGuards.js';

export function useAnnouncementQueue() {
  const [current, setCurrent] = useState(null);
  const isDuplicateRef = useRef(null);
  if (!isDuplicateRef.current) isDuplicateRef.current = createDedupeGuard();

  const announcer = useMemo(() => createAnnouncer({
    onShow: a => setCurrent(a),
    onHide: () => setCurrent(null)
  }), []);

  const ingestFrame = useCallback(msg => {
    for (const item of msg.announcements || []) {
      if (isDuplicateRef.current(item)) continue;
      announcer.enqueue(item);
    }
  }, [announcer]);

  return { announcer, current, ingestFrame };
}
```

- [ ] **Step 4: Write `useFlipAnimation`**

Create `src/hooks/useFlipAnimation.js`:

```js
import { useCallback, useRef } from 'react';

export function useFlipAnimation() {
  const rowRefs = useRef(new Map());
  const oldTopsRef = useRef({});

  const captureOldTops = useCallback(() => {
    oldTopsRef.current = Object.fromEntries(
      [...rowRefs.current.entries()].map(([agent, node]) => [agent, node.getBoundingClientRect().top])
    );
  }, []);

  const applyFlip = useCallback(() => {
    const oldTops = oldTopsRef.current;
    for (const [agent, node] of rowRefs.current.entries()) {
      const oldTop = oldTops[agent];
      if (oldTop === undefined) continue;
      const delta = oldTop - node.getBoundingClientRect().top;
      if (!delta) continue;
      node.style.transform = `translateY(${delta}px)`;
      requestAnimationFrame(() => {
        node.classList.add('moving');
        node.style.transform = '';
        node.addEventListener('transitionend', () => node.classList.remove('moving'), { once: true });
      });
    }
  }, []);

  return { rowRefs, captureOldTops, applyFlip };
}
```

- [ ] **Step 5: Write `useScoreFlash`**

Create `src/hooks/useScoreFlash.js`:

```js
import { useCallback, useRef, useState } from 'react';

export function useScoreFlash() {
  const [scoredAgents, setScoredAgents] = useState(() => new Set());
  const lastSolvedRef = useRef({});

  const syncSolved = useCallback(leaderboard => {
    const increased = new Set();
    for (const row of leaderboard) {
      const previous = lastSolvedRef.current[row.agent];
      if (previous !== undefined && row.solved > previous) increased.add(row.agent);
    }
    if (increased.size) setScoredAgents(increased);
    lastSolvedRef.current = Object.fromEntries(leaderboard.map(row => [row.agent, row.solved]));
  }, []);

  const resetScores = useCallback(() => {
    lastSolvedRef.current = {};
  }, []);

  const clearScored = useCallback(agent => {
    setScoredAgents(current => {
      if (!current.has(agent)) return current;
      const next = new Set(current);
      next.delete(agent);
      return next;
    });
  }, []);

  return { scoredAgents, clearScored, resetScores, syncSolved };
}
```

- [ ] **Step 6: Run the full suite (nothing wired yet — must still pass)**

Run: `npm test`
Expected: PASS. `App.jsx` is unchanged; the hooks are dead code until Task 17.

- [ ] **Step 7: Commit**

```bash
git add src/hooks
git commit -m "refactor: add arena snapshot, announcement, and animation hooks"
```

---

## Task 16: Services + Actions — ticket IDs, secret store, ticket events

**Files:**
- Create: `src/services/ticketIds.js`
- Create: `src/services/secretStore.js`
- Create: `src/actions/sendTicketEvent.js`
- Create: `src/actions/createTicket.js`
- Create: `src/actions/resolveTicket.js`
- Create: `src/actions/resetDay.js`
- Test: `tests/actions.test.js`

`secretStore.reset()` must call `removeItem` and return the fallback (Critical Constraint 2).

- [ ] **Step 1: Write the failing test**

Create `tests/actions.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/actions.test.js`
Expected: FAIL — `Cannot find module '../src/services/ticketIds.js'`

- [ ] **Step 3: Write the services**

Create `src/services/ticketIds.js`:

```js
export function createTicketIds(seed = Math.floor(Date.now() / 1000) % 100000) {
  let seq = seed;
  const open = {};

  function mint() {
    return `T-${++seq}`;
  }

  return {
    forCreate(agent) {
      const id = mint();
      open[agent] = id;
      return id;
    },
    forResolve(agent) {
      if (open[agent]) {
        const id = open[agent];
        delete open[agent];
        return id;
      }
      return mint();
    }
  };
}
```

Create `src/services/secretStore.js`:

```js
const STORAGE_KEY = 'arena-secret';
const DEFAULT_SECRET = 'arena-dev-secret';

export function createSecretStore(storage = window.localStorage) {
  return {
    get() {
      return storage.getItem(STORAGE_KEY) || DEFAULT_SECRET;
    },
    set(value) {
      storage.setItem(STORAGE_KEY, value);
    },
    // Clears the stored secret so the next read falls back to the dev default.
    reset() {
      storage.removeItem(STORAGE_KEY);
      return DEFAULT_SECRET;
    }
  };
}
```

- [ ] **Step 4: Write the actions**

Create `src/actions/sendTicketEvent.js`:

```js
const BAD_SECRET_MESSAGE =
  'Test event rejected: bad webhook secret. The server is not using arena-dev-secret.';

export async function sendTicketEvent({ api, secretStore, notify = window.alert }, payload) {
  let secret = secretStore.get();
  let res = await api.postEvent(payload, secret);

  if (res.status === 401) {
    secret = secretStore.reset();
    res = await api.postEvent(payload, secret);
    if (res.status === 401) {
      notify(BAD_SECRET_MESSAGE);
      return { ok: false, secret };
    }
  }

  if (!res.ok) console.warn('test event rejected:', res.status, await res.text());
  return { ok: res.ok, secret };
}
```

Create `src/actions/createTicket.js`:

```js
import { sendTicketEvent } from './sendTicketEvent.js';

export function createTicket(deps, { agent, service }) {
  return sendTicketEvent(deps, {
    type: 'ticket.created',
    agent,
    service,
    ticketId: deps.ticketIds.forCreate(agent)
  });
}
```

Create `src/actions/resolveTicket.js`:

```js
import { sendTicketEvent } from './sendTicketEvent.js';

export function resolveTicket(deps, { agent, service }) {
  return sendTicketEvent(deps, {
    type: 'ticket.resolved',
    agent,
    service,
    ticketId: deps.ticketIds.forResolve(agent)
  });
}
```

Create `src/actions/resetDay.js`:

```js
const NOT_DEV_MESSAGE = 'reset only works when server runs with DEV=1';

export async function resetDay({ api, notify = window.alert }) {
  const res = await api.postDevReset();
  if (!res.ok) notify(NOT_DEV_MESSAGE);
  return { ok: res.ok };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --import tsx --test tests/actions.test.js`
Expected: PASS (6 tests)

The payload key order in the `createTicket` test matters for `deepStrictEqual` on objects? No — `assert.deepStrictEqual` compares objects structurally, not by key order. If it fails, the values differ, not the ordering.

- [ ] **Step 6: Commit**

```bash
git add src/services/ticketIds.js src/services/secretStore.js src/actions tests/actions.test.js
git commit -m "refactor: extract ticket-event actions with dependency injection"
```

---

## Task 17: Components + App composition

**Files:**
- Create: `src/components/Header.jsx`, `Leaderboard.jsx`, `KillFeed.jsx`, `UnlockGate.jsx`, `AnnouncementOverlay.jsx`, `MiniBanner.jsx`
- Create: `src/components/TestPanel/TestPanel.jsx`, `TestPanelControls.jsx`, `AgentGrid.jsx`
- Rewrite: `src/App.jsx`

This deletes the temporary bridge functions from Task 12, the four refs, and `AnnouncementLayers`.

- [ ] **Step 1: Write the presentational components**

Create `src/components/Header.jsx`:

```jsx
export function Header({ snapshot, live }) {
  const firstBlood = snapshot?.state?.firstBlood;
  return (
    <header>
      <h1 className="site-title">TICKET <span className="accent">ARENA</span></h1>
      <div className="header-meta">
        <span className="day-label">{snapshot?.day || ''}</span>
        <span className={`fb-chip ${firstBlood ? '' : 'hidden'}`}>
          {firstBlood ? <>FIRST BLOOD: <strong>{firstBlood.agent}</strong> on {firstBlood.service}</> : null}
        </span>
        <span className={`conn-dot ${live ? 'live' : ''}`} title="live connection" />
      </div>
    </header>
  );
}
```

Create `src/components/Leaderboard.jsx`:

```jsx
export function Leaderboard({ rows, rowRefs, scoredAgents, onScoreAnimationEnd }) {
  return (
    <section className="board-wrap">
      <ol className="board">
        {rows.map(row => (
          <li
            key={row.agent}
            ref={node => {
              if (node) rowRefs.current.set(row.agent, node);
              else rowRefs.current.delete(row.agent);
            }}
            className={[
              'board-row',
              row.rank === 1 && row.solved > 0 ? 'top1' : '',
              scoredAgents.has(row.agent) ? 'scored' : ''
            ].filter(Boolean).join(' ')}
            data-agent={row.agent}
            onAnimationEnd={() => onScoreAnimationEnd(row.agent)}
          >
            <span className="rank">#{row.rank}</span>
            <span className="agent">{row.agent} {row.streak ? <span className="streak-badge">*</span> : null}</span>
            <span className="solved">{row.solved}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
```

Create `src/components/KillFeed.jsx`:

```jsx
import { fmtTime } from '../domain/time.js';

function feedClass(label) {
  if (label === 'FIRST BLOOD') return 'blood';
  if (label === 'solved') return 'solved';
  return 'opened';
}

export function KillFeed({ feed }) {
  return (
    <aside className="feed-wrap">
      <h2 className="feed-title">KILL FEED</h2>
      <ul className="feed">
        {feed.map(item => (
          <li key={`${item.ts}-${item.ticketId}-${item.label}`}>
            <span>
              <span className="who">{item.agent}</span>{' '}
              <span className={`what ${feedClass(item.label)}`}>{item.label}</span>{' '}
              {item.ticketId} <em>{item.service}</em>
            </span>
            <time>{fmtTime(item.ts)}</time>
          </li>
        ))}
      </ul>
    </aside>
  );
}
```

Create `src/components/UnlockGate.jsx`:

```jsx
export function UnlockGate({ unlocked, onUnlock }) {
  return (
    <div id="unlock-gate" className={unlocked ? 'hidden' : ''}>
      <div className="gate-inner">
        <div className="gate-title">TICKET ARENA</div>
        <button id="unlock-btn" onClick={onUnlock}>CLICK TO ARM SPEAKERS</button>
        <div className="gate-hint">browser needs one click before it may play sound</div>
      </div>
    </div>
  );
}
```

Create `src/components/AnnouncementOverlay.jsx`:

```jsx
export function AnnouncementOverlay({ announcement }) {
  const gold = announcement.kind === 'tier' && announcement.count >= 5;
  return (
    <div className={`announce ${gold ? 'gold' : ''}`}>
      <div className="announce-inner">
        <div className="announce-title">{announcement.title}</div>
        <div className="announce-line">{announcement.line}</div>
      </div>
    </div>
  );
}
```

Create `src/components/MiniBanner.jsx`:

```jsx
export function MiniBanner({ announcement }) {
  return <div className="mini-banner">{announcement.title} - {announcement.line}</div>;
}
```

Note: the old markup kept `.announce` and `.mini-banner` permanently mounted and toggled a `hidden` class. These components mount and unmount instead, so the `hidden` class is no longer applied — `App.jsx` renders them conditionally. `src/styles.css` needs no change: `.hidden` only ever meant `display: none`, and an unmounted node is equivalent. Verify visually in Step 6.

- [ ] **Step 2: Write the test panel components**

Create `src/components/TestPanel/TestPanelControls.jsx`:

```jsx
export function TestPanelControls({ services, selectedService, onServiceChange, secret, onSecretChange, onReset }) {
  return (
    <div className="tp-row">
      <label>
        service
        <select value={selectedService} onChange={event => onServiceChange(event.target.value)}>
          {services.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <label>
        secret
        <input value={secret} type="text" size="16" onChange={event => onSecretChange(event.target.value)} />
      </label>
      <button id="test-reset" className="tp-danger" onClick={onReset}>RESET DAY</button>
    </div>
  );
}
```

Create `src/components/TestPanel/AgentGrid.jsx`:

```jsx
import React from 'react';

export function AgentGrid({ agents, onCreate, onResolve }) {
  return (
    <div className="tp-grid">
      {agents.map(agent => (
        <React.Fragment key={agent}>
          <span className="tp-name">{agent}</span>
          <button data-agent={agent} data-type="ticket.created" onClick={() => onCreate(agent)}>+ ticket</button>
          <button data-agent={agent} data-type="ticket.resolved" className="solve" onClick={() => onResolve(agent)}>resolve</button>
        </React.Fragment>
      ))}
    </div>
  );
}
```

Create `src/components/TestPanel/TestPanel.jsx`:

```jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { agentsFrom, servicesFrom } from '../../domain/snapshot.js';
import { useHotkey } from '../../hooks/useHotkey.js';
import * as api from '../../services/arenaApi.js';
import { createSecretStore } from '../../services/secretStore.js';
import { createTicketIds } from '../../services/ticketIds.js';
import { createTicket } from '../../actions/createTicket.js';
import { resolveTicket } from '../../actions/resolveTicket.js';
import { resetDay } from '../../actions/resetDay.js';
import { TestPanelControls } from './TestPanelControls.jsx';
import { AgentGrid } from './AgentGrid.jsx';

export function TestPanel({ snapshot }) {
  const [visible, setVisible] = useState(() => new URLSearchParams(window.location.search).get('test') === '1');
  const secretStore = useMemo(() => createSecretStore(), []);
  const ticketIds = useRef(null);
  if (!ticketIds.current) ticketIds.current = createTicketIds();

  const [secret, setSecret] = useState(() => secretStore.get());
  const [service, setService] = useState('');

  const agents = agentsFrom(snapshot);
  const services = servicesFrom(snapshot);
  const selectedService = service || services[0] || 'General';

  useEffect(() => {
    if (!services.includes(service)) setService(services[0] || 'General');
  }, [service, services]);

  useHotkey('t', useCallback(() => setVisible(current => !current), []));

  const deps = { api, secretStore, ticketIds: ticketIds.current };

  function changeSecret(value) {
    setSecret(value);
    secretStore.set(value);
  }

  async function onCreate(agent) {
    const result = await createTicket(deps, { agent, service: selectedService });
    setSecret(result.secret);
  }

  async function onResolve(agent) {
    const result = await resolveTicket(deps, { agent, service: selectedService });
    setSecret(result.secret);
  }

  return (
    <div id="test-panel" className={`test-panel ${visible ? '' : 'hidden'}`}>
      <div className="tp-head">TEST PANEL <span className="tp-hint">(press T to hide)</span></div>
      <TestPanelControls
        services={services}
        selectedService={selectedService}
        onServiceChange={setService}
        secret={secret}
        onSecretChange={changeSecret}
        onReset={() => resetDay({ api })}
      />
      <AgentGrid agents={agents} onCreate={onCreate} onResolve={onResolve} />
    </div>
  );
}
```

- [ ] **Step 3: Rewrite `App.jsx`**

Replace the entire contents of `src/App.jsx` with:

```jsx
import { useCallback, useLayoutEffect, useState } from 'react';
import { EMPTY_STATE } from './domain/snapshot.js';
import { isBigAnnouncement } from './guards/announcementGuards.js';
import { useAnnouncementQueue } from './hooks/useAnnouncementQueue.js';
import { useArenaSnapshot } from './hooks/useArenaSnapshot.js';
import { useFlipAnimation } from './hooks/useFlipAnimation.js';
import { useScoreFlash } from './hooks/useScoreFlash.js';
import { Header } from './components/Header.jsx';
import { Leaderboard } from './components/Leaderboard.jsx';
import { KillFeed } from './components/KillFeed.jsx';
import { UnlockGate } from './components/UnlockGate.jsx';
import { AnnouncementOverlay } from './components/AnnouncementOverlay.jsx';
import { MiniBanner } from './components/MiniBanner.jsx';
import { TestPanel } from './components/TestPanel/TestPanel.jsx';

export default function App() {
  const [unlocked, setUnlocked] = useState(false);
  const { announcer, current, ingestFrame } = useAnnouncementQueue();
  const { rowRefs, captureOldTops, applyFlip } = useFlipAnimation();
  const { scoredAgents, clearScored, resetScores, syncSolved } = useScoreFlash();

  const onBeforeApply = useCallback(next => {
    if (next?.config?.announcer) announcer.configure(next.config.announcer);
    captureOldTops();
  }, [announcer, captureOldTops]);

  const onMessage = useCallback(msg => {
    if (msg.dayRolled) resetScores();
    ingestFrame(msg);
  }, [ingestFrame, resetScores]);

  const { snapshot, live } = useArenaSnapshot({ onBeforeApply, onMessage });

  useLayoutEffect(() => {
    if (!snapshot) return;
    applyFlip();
    syncSolved(snapshot.state.leaderboard);
  }, [snapshot, applyFlip, syncSolved]);

  const state = snapshot?.state || EMPTY_STATE;

  function unlock() {
    announcer.unlock();
    setUnlocked(true);
  }

  return (
    <>
      <UnlockGate unlocked={unlocked} onUnlock={unlock} />
      <Header snapshot={snapshot} live={live} />
      <main>
        <Leaderboard
          rows={state.leaderboard}
          rowRefs={rowRefs}
          scoredAgents={scoredAgents}
          onScoreAnimationEnd={clearScored}
        />
        <KillFeed feed={state.feed} />
      </main>
      {current && (isBigAnnouncement(current)
        ? <AnnouncementOverlay announcement={current} />
        : <MiniBanner announcement={current} />)}
      <TestPanel snapshot={snapshot} />
    </>
  );
}
```

- [ ] **Step 4: Run the component tests**

Run: `node --import tsx --test tests/app.test.js`
Expected: PASS — all 3 tests.

The dedupe test at line 74 exercises `useAnnouncementQueue`'s guard through two identical `onmessage` frames and asserts only one `/sound/transmission.mp3` playback.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — every file.

- [ ] **Step 6: Verify the app renders and banners still appear**

```bash
npm run build && npm run dev
```

Open `http://localhost:5173?test=1`, click `CLICK TO ARM SPEAKERS`, then click `+ ticket` for any agent. Confirm the FIRST BLOOD fullscreen overlay appears, then disappears. Click `resolve` twice for the same agent to confirm the DOUBLE KILL overlay, and once more for a mini banner on a `SOLVED` tier.

- [ ] **Step 7: Commit**

```bash
git add src/components src/App.jsx
git commit -m "refactor: split App into components; banners render from React state"
```

---

## Task 18: Backend — HTTP primitives and guards

**Files:**
- Create: `lib/server/http/responses.js`
- Create: `lib/server/http/readBody.js`
- Create: `lib/server/guards/webhookSecret.js`
- Create: `lib/server/guards/devOnly.js`
- Create: `lib/server/guards/jsonBody.js`
- Create: `lib/server/guards/ttsConfigured.js`
- Test: `tests/server-guards.test.js`

**Guard contract:** a guard receives the request `context` and returns `null` to let the request proceed, or a rejection object to short-circuit. A rejection is `{ status, json }` or `{ status, text }`. `jsonBodyGuard` also assigns `context.body` on success.

**Context shape:** `{ req, res, url, deps, body }` where `deps` is `{ config, store, arena, sse, fishTts, dev, webhookSecret, logger }`.

- [ ] **Step 1: Write the failing test**

Create `tests/server-guards.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { webhookSecretGuard } = require('../lib/server/guards/webhookSecret');
const { devOnlyGuard } = require('../lib/server/guards/devOnly');
const { jsonBodyGuard } = require('../lib/server/guards/jsonBody');
const { ttsConfiguredGuard } = require('../lib/server/guards/ttsConfigured');

function ctx(overrides = {}) {
  return {
    req: { headers: {}, method: 'POST', ...overrides.req },
    deps: { dev: false, webhookSecret: 'sekret', fishTts: null, ...overrides.deps },
    ...overrides
  };
}

test('webhookSecretGuard passes a matching header and rejects a mismatch', async () => {
  const ok = ctx({ req: { headers: { 'x-webhook-secret': 'sekret' } } });
  assert.strictEqual(await webhookSecretGuard(ok), null);

  const bad = ctx({ req: { headers: { 'x-webhook-secret': 'wrong' } } });
  assert.deepStrictEqual(await webhookSecretGuard(bad), { status: 401, json: { error: 'bad secret' } });
});

test('webhookSecretGuard passes when no secret is configured', async () => {
  const open = ctx({ deps: { webhookSecret: '' } });
  assert.strictEqual(await webhookSecretGuard(open), null);
});

test('devOnlyGuard hides the route outside dev mode', async () => {
  assert.deepStrictEqual(await devOnlyGuard(ctx()), { status: 404, text: 'not found' });
  assert.strictEqual(await devOnlyGuard(ctx({ deps: { dev: true } })), null);
});

test('ttsConfiguredGuard rejects when fishTts is absent', async () => {
  assert.deepStrictEqual(await ttsConfiguredGuard(ctx()), { status: 503, json: { error: 'tts not configured' } });
  assert.strictEqual(await ttsConfiguredGuard(ctx({ deps: { fishTts: {} } })), null);
});

test('jsonBodyGuard parses the body onto the context', async () => {
  const { Readable } = require('node:stream');
  const req = Readable.from([JSON.stringify({ type: 'ticket.created' })]);
  req.headers = {};
  req.method = 'POST';

  const context = ctx({ req });
  assert.strictEqual(await jsonBodyGuard(context), null);
  assert.deepStrictEqual(context.body, { type: 'ticket.created' });
});

test('jsonBodyGuard rejects malformed JSON', async () => {
  const { Readable } = require('node:stream');
  const req = Readable.from(['{not json']);
  req.headers = {};
  req.method = 'POST';

  const context = ctx({ req });
  assert.deepStrictEqual(await jsonBodyGuard(context), { status: 400, json: { error: 'invalid JSON' } });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/server-guards.test.js`
Expected: FAIL — `Cannot find module '../lib/server/guards/webhookSecret'`

- [ ] **Step 3: Write the HTTP primitives**

Create `lib/server/http/responses.js`:

```js
'use strict';

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function sendAudio(res, buf) {
  res.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'Content-Length': buf.length,
    'Cache-Control': 'private, max-age=86400'
  });
  res.end(buf);
}

function sendText(res, status, text) {
  res.writeHead(status);
  res.end(text);
}

// Applies a guard rejection, which is either { status, json } or { status, text }.
function sendRejection(res, rejection) {
  if (rejection.json !== undefined) return sendJson(res, rejection.status, rejection.json);
  return sendText(res, rejection.status, rejection.text ?? '');
}

module.exports = { sendJson, sendAudio, sendText, sendRejection };
```

Create `lib/server/http/readBody.js`:

```js
'use strict';

const MAX_BODY_BYTES = 64 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > MAX_BODY_BYTES) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

module.exports = { readBody, MAX_BODY_BYTES };
```

- [ ] **Step 4: Write the guards**

Create `lib/server/guards/webhookSecret.js`:

```js
'use strict';

async function webhookSecretGuard(context) {
  const { webhookSecret } = context.deps;
  if (!webhookSecret) return null;
  if (context.req.headers['x-webhook-secret'] === webhookSecret) return null;
  return { status: 401, json: { error: 'bad secret' } };
}

module.exports = { webhookSecretGuard };
```

Create `lib/server/guards/devOnly.js`:

```js
'use strict';

async function devOnlyGuard(context) {
  if (context.deps.dev) return null;
  return { status: 404, text: 'not found' };
}

module.exports = { devOnlyGuard };
```

Create `lib/server/guards/ttsConfigured.js`:

```js
'use strict';

async function ttsConfiguredGuard(context) {
  if (context.deps.fishTts) return null;
  return { status: 503, json: { error: 'tts not configured' } };
}

module.exports = { ttsConfiguredGuard };
```

Create `lib/server/guards/jsonBody.js`:

```js
'use strict';
const { readBody } = require('../http/readBody');

// Parses the request body onto context.body. An empty body parses to null,
// which matches the original `JSON.parse(await readBody(req) || 'null')`.
async function jsonBodyGuard(context) {
  try {
    context.body = JSON.parse((await readBody(context.req)) || 'null');
    return null;
  } catch (_) {
    return { status: 400, json: { error: 'invalid JSON' } };
  }
}

module.exports = { jsonBodyGuard };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --import tsx --test tests/server-guards.test.js`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/server/http lib/server/guards tests/server-guards.test.js
git commit -m "refactor: add backend HTTP primitives and route guards"
```

---

## Task 19: Backend — arena state, SSE hub, static files

**Files:**
- Create: `lib/server/services/arenaState.js`
- Create: `lib/server/services/sseHub.js`
- Create: `lib/server/services/staticFiles.js`
- Test: `tests/server-services.test.js`

`arenaState` owns `currentDay`, the in-memory day state, `snapshot()`, and `ensureCurrentDay()`. It broadcasts nothing itself — it calls `onDayRoll(snapshot)`, which `createArenaServer` wires to `sseHub.broadcast`. That is how the original's day-roll broadcast is preserved without `arenaState` depending on `sseHub`.

- [ ] **Step 1: Write the failing test**

Create `tests/server-services.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { createArenaState } = require('../lib/server/services/arenaState');
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/server-services.test.js`
Expected: FAIL — `Cannot find module '../lib/server/services/arenaState'`

- [ ] **Step 3: Write `arenaState`**

Create `lib/server/services/arenaState.js`:

```js
'use strict';
const { createDay, applyEvent, publicState, dayKey } = require('../../engine');

function createArenaState({ config, store, now = Date.now, logger = console, onDayRoll = () => {} }) {
  const applyOptions = {
    templates: config.announcements && config.announcements.templates,
    tiers: config.announcements && config.announcements.tiers
  };

  let currentDay = dayKey(now(), config.timezone);
  let state = createDay(config.agents);

  function rebuildFromLog() {
    state = createDay(config.agents);
    for (const event of store.todayEvents(now())) applyEvent(state, event, applyOptions);
  }

  function snapshot(extra = {}) {
    return {
      day: currentDay,
      state: publicState(state),
      config: { agents: config.agents, services: config.services, announcer: config.announcer },
      announcements: [],
      ...extra
    };
  }

  function ensureCurrentDay({ notify = true } = {}) {
    const today = dayKey(now(), config.timezone);
    if (today === currentDay) return false;
    currentDay = today;
    state = createDay(config.agents);
    logger.log(`[arena] day rolled to ${today} - board reset`);
    if (notify) onDayRoll(snapshot({ dayRolled: true }));
    return true;
  }

  function reset() {
    state = createDay(config.agents);
  }

  rebuildFromLog();

  return {
    snapshot,
    ensureCurrentDay,
    reset,
    applyEvent: event => applyEvent(state, event, applyOptions)
  };
}

module.exports = { createArenaState };
```

- [ ] **Step 4: Write `sseHub`**

Create `lib/server/services/sseHub.js`:

```js
'use strict';

const KEEPALIVE_MS = 25000;

function createSseHub() {
  const clients = new Set();

  return {
    add(res) {
      clients.add(res);
    },
    remove(res) {
      clients.delete(res);
    },
    broadcast(payload) {
      const frame = `data: ${JSON.stringify(payload)}\n\n`;
      for (const res of clients) res.write(frame);
    },
    keepAliveMs: KEEPALIVE_MS,
    get size() {
      return clients.size;
    }
  };
}

module.exports = { createSseHub, KEEPALIVE_MS };
```

- [ ] **Step 5: Write `staticFiles`**

Create `lib/server/services/staticFiles.js`:

```js
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.json': 'application/json'
};

function isInside(file, root) {
  return file === root || file.startsWith(root + path.sep);
}

function serveFileFrom(res, root, urlPath, defaultFile = null) {
  const rawRel = defaultFile && urlPath === '/' ? defaultFile : urlPath.replace(/^\/+/, '');
  const rel = decodeURIComponent(rawRel);
  const file = path.resolve(path.join(root, rel));
  if (!isInside(file, root)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

module.exports = { MIME, isInside, serveFileFrom };
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --import tsx --test tests/server-services.test.js`
Expected: PASS (5 tests)

- [ ] **Step 7: Commit**

```bash
git add lib/server/services tests/server-services.test.js
git commit -m "refactor: extract arenaState, sseHub, and staticFiles services"
```

---

## Task 20: Backend — actions and router

**Files:**
- Create: `lib/server/actions/ingestEvent.js`, `getState.js`, `tts.js`, `sse.js`, `resetDay.js`, `serveStatic.js`
- Create: `lib/server/router.js`
- Test: `tests/server-router.test.js`

**Route matching:** routes match on `method` (a string or array of strings) and either an exact `path` or a `prefix`. A route with neither `path` nor `prefix` matches any URL for its method — that is the static-file fallback and must be last. An unmatched request gets `405 method not allowed`, preserving the original behavior for non-`GET` methods.

- [ ] **Step 1: Write the failing test**

Create `tests/server-router.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/server-router.test.js`
Expected: FAIL — `Cannot find module '../lib/server/router'`

- [ ] **Step 3: Write the router**

Create `lib/server/router.js`:

```js
'use strict';
const { sendRejection, sendText } = require('./http/responses');

function methodMatches(routeMethod, method) {
  if (Array.isArray(routeMethod)) return routeMethod.includes(method);
  return routeMethod === method;
}

function matchRoute(route, method, url) {
  if (!methodMatches(route.method, method)) return false;
  if (route.path) return url.pathname === route.path;
  if (route.prefix) return url.pathname.startsWith(route.prefix);
  return true;
}

// Strategy: the first route whose method and path match wins. Guards run in
// declaration order; the first one to return a rejection ends the request.
function createRouter(routes, deps) {
  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const context = { req, res, url, deps, body: undefined };

    for (const route of routes) {
      if (!matchRoute(route, req.method, url)) continue;

      for (const guard of route.guards || []) {
        const rejection = await guard(context);
        if (rejection) return sendRejection(res, rejection);
      }
      return route.action(context);
    }

    return sendText(res, 405, 'method not allowed');
  };
}

module.exports = { createRouter, matchRoute };
```

- [ ] **Step 4: Write the actions**

Create `lib/server/actions/ingestEvent.js`:

```js
'use strict';
const { parseWebhook } = require('../../adapter');
const { sendJson } = require('../http/responses');

async function ingestEventAction(context) {
  const { res, body, deps } = context;
  const { config, store, arena, sse, now, logger } = deps;

  const parsed = parseWebhook(body, config.agents);
  if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });
  parsed.event.ts = now();

  const { accepted, announcements } = arena.applyEvent(parsed.event);
  if (accepted) {
    store.append(parsed.event);
    sse.broadcast(arena.snapshot({ announcements }));
    logger.log(`[arena] ${parsed.event.type} ${parsed.event.ticketId} by ${parsed.event.agent}` +
      (announcements[0] ? ` -> ${announcements[0].title}` : ''));
  }
  return sendJson(res, 200, { accepted });
}

module.exports = { ingestEventAction };
```

Create `lib/server/actions/getState.js`:

```js
'use strict';
const { sendJson } = require('../http/responses');

async function getStateAction(context) {
  return sendJson(context.res, 200, context.deps.arena.snapshot());
}

module.exports = { getStateAction };
```

Create `lib/server/actions/tts.js`:

```js
'use strict';
const { readBody } = require('../http/readBody');
const { sendJson, sendAudio } = require('../http/responses');

const MAX_TEXT_LENGTH = 240;

function bodyFromQuery(url) {
  return {
    text: url.searchParams.get('text'),
    announcement: {
      kind: url.searchParams.get('kind'),
      count: Number(url.searchParams.get('count')) || undefined,
      title: url.searchParams.get('title')
    }
  };
}

async function ttsAction(context) {
  const { req, res, url, deps } = context;
  const { fishTts, logger } = deps;

  let body;
  if (req.method === 'GET') {
    body = bodyFromQuery(url);
  } else {
    try { body = JSON.parse((await readBody(req)) || 'null'); }
    catch { return sendJson(res, 400, { error: 'invalid JSON' }); }
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > MAX_TEXT_LENGTH) return sendJson(res, 400, { error: 'bad text' });

  try {
    const audio = await fishTts.synthesize({
      text,
      announcement: body.announcement && typeof body.announcement === 'object' ? body.announcement : {}
    });
    return sendAudio(res, audio);
  } catch (err) {
    logger.log(`[arena] fish tts failed: ${err.message}`);
    return sendJson(res, err.statusCode || 502, { error: 'tts failed' });
  }
}

module.exports = { ttsAction };
```

Note: `ttsAction` reads its own body rather than using `jsonBodyGuard`, because `GET /api/tts` carries its payload in the query string. Wiring `jsonBodyGuard` onto this route would consume a body that never arrives on `GET`.

Create `lib/server/actions/sse.js`:

```js
'use strict';

async function sseAction(context) {
  const { req, res, deps } = context;
  const { arena, sse } = deps;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  res.write(`data: ${JSON.stringify(arena.snapshot())}\n\n`);
  sse.add(res);

  const keepAlive = setInterval(() => res.write(': ping\n\n'), sse.keepAliveMs);
  req.on('close', () => {
    clearInterval(keepAlive);
    sse.remove(res);
  });
}

module.exports = { sseAction };
```

Create `lib/server/actions/resetDay.js`:

```js
'use strict';
const { sendJson } = require('../http/responses');

async function resetDayAction(context) {
  const { res, deps } = context;
  const { store, arena, sse } = deps;

  store.clear();
  arena.reset();
  sse.broadcast(arena.snapshot({ dayRolled: true }));
  return sendJson(res, 200, { ok: true });
}

module.exports = { resetDayAction };
```

Create `lib/server/actions/serveStatic.js`:

```js
'use strict';
const { serveFileFrom } = require('../services/staticFiles');

async function serveSoundAction(context) {
  const { res, url, deps } = context;
  return serveFileFrom(res, deps.soundDir, url.pathname.replace(/^\/sound\/?/, ''));
}

async function servePublicAction(context) {
  const { res, url, deps } = context;
  return serveFileFrom(res, deps.publicDir, url.pathname, 'index.html');
}

module.exports = { serveSoundAction, servePublicAction };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --import tsx --test tests/server-router.test.js`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/server/router.js lib/server/actions tests/server-router.test.js
git commit -m "refactor: add backend route table and per-route actions"
```

---

## Task 21: Backend — compose the server

**Files:**
- Create: `lib/server/createArenaServer.js`
- Rewrite: `lib/http-server.js` (thin re-export)

`tests/server.test.js` imports `{ createArenaServer }` from `../lib/http-server` and must not be edited (Critical Constraint 5). The old file becomes a one-line re-export.

Note the ordering inside the composition root: `sseHub` is constructed first, then `arenaState` receives `onDayRoll: snap => sse.broadcast(snap)`. `arenaState` never imports `sseHub`, so the dependency runs one way only.

The original called `ensureCurrentDay()` at the top of `/api/events`, `/api/state`, and `/events`. Each of those three actions now calls `deps.arena.ensureCurrentDay()` itself. `/api/tts`, `/api/dev/reset`, and the static routes never did, and still do not.

- [ ] **Step 1: Add the day-roll guard**

`lib/http-server.js:117-118` calls `ensureCurrentDay()` on `/api/events` *before* the webhook secret is checked, and likewise at the top of `/api/state` and `/events`. Guards run before actions, so this belongs in the guard chain — placed first, ahead of `webhookSecretGuard` — not inside the action bodies. Put it anywhere later and a request arriving across a midnight boundary with a bad secret would skip the board reset.

Create `lib/server/guards/ensureDay.js`:

```js
'use strict';

// Side-effecting guard: rolls the board to today before the request is handled.
// It never rejects; it returns null so the request always proceeds.
async function ensureDayGuard(context) {
  context.deps.arena.ensureCurrentDay();
  return null;
}

module.exports = { ensureDayGuard };
```

Leave `getState.js` and `ingestEvent.js` exactly as Task 20 wrote them — neither calls `ensureCurrentDay()` itself. `ensureDayGuard` is listed first on the `/api/events`, `/api/state`, and `/events` routes, and on no others: `/api/tts`, `/api/dev/reset`, and the static routes never rolled the day and still do not.

- [ ] **Step 2: Write the composition root**

Create `lib/server/createArenaServer.js`:

```js
'use strict';
const http = require('node:http');
const path = require('node:path');
const { createRouter } = require('./router');
const { createArenaState } = require('./services/arenaState');
const { createSseHub } = require('./services/sseHub');
const { ensureDayGuard } = require('./guards/ensureDay');
const { webhookSecretGuard } = require('./guards/webhookSecret');
const { devOnlyGuard } = require('./guards/devOnly');
const { jsonBodyGuard } = require('./guards/jsonBody');
const { ttsConfiguredGuard } = require('./guards/ttsConfigured');
const { ingestEventAction } = require('./actions/ingestEvent');
const { getStateAction } = require('./actions/getState');
const { ttsAction } = require('./actions/tts');
const { sseAction } = require('./actions/sse');
const { resetDayAction } = require('./actions/resetDay');
const { serveSoundAction, servePublicAction } = require('./actions/serveStatic');

const DAY_ROLL_INTERVAL_MS = 30000;

function createArenaServer({
  config,
  store,
  publicDir = path.join(__dirname, '..', '..', 'public'),
  soundDir = path.join(__dirname, '..', '..', 'sound'),
  dev = false,
  webhookSecret = config.webhookSecret,
  fishTts = null,
  now = Date.now,
  logger = console
}) {
  const sse = createSseHub();
  const arena = createArenaState({
    config,
    store,
    now,
    logger,
    onDayRoll: snap => sse.broadcast(snap)
  });

  const deps = {
    config,
    store,
    arena,
    sse,
    fishTts,
    dev,
    webhookSecret,
    now,
    logger,
    publicDir: path.resolve(publicDir),
    soundDir: path.resolve(soundDir)
  };

  const routes = [
    { method: 'POST', path: '/api/events', guards: [ensureDayGuard, webhookSecretGuard, jsonBodyGuard], action: ingestEventAction },
    { method: 'GET', path: '/api/state', guards: [ensureDayGuard], action: getStateAction },
    { method: ['GET', 'POST'], path: '/api/tts', guards: [ttsConfiguredGuard], action: ttsAction },
    { method: 'GET', path: '/events', guards: [ensureDayGuard], action: sseAction },
    { method: 'POST', path: '/api/dev/reset', guards: [devOnlyGuard], action: resetDayAction },
    { method: 'GET', prefix: '/sound/', action: serveSoundAction },
    { method: 'GET', action: servePublicAction }
  ];

  const server = http.createServer(createRouter(routes, deps));

  const dayRollTimer = setInterval(() => arena.ensureCurrentDay(), DAY_ROLL_INTERVAL_MS);
  if (dayRollTimer.unref) dayRollTimer.unref();
  server.on('close', () => clearInterval(dayRollTimer));

  return {
    server,
    snapshot: arena.snapshot,
    ensureCurrentDay: arena.ensureCurrentDay
  };
}

module.exports = { createArenaServer };
```

- [ ] **Step 3: Replace `lib/http-server.js` with a re-export**

Replace the entire contents of `lib/http-server.js` with:

```js
'use strict';
// Kept as the stable import path for `createArenaServer`.
// The implementation now lives in lib/server/.
module.exports = require('./server/createArenaServer');
```

- [ ] **Step 4: Run the backend tests**

Run: `node --import tsx --test tests/server.test.js`
Expected: PASS — every test, unmodified.

If a `/api/events` test fails with a 401 where it expected a 400, the guard order is wrong: `ensureDayGuard` must come before `webhookSecretGuard`, which must come before `jsonBodyGuard`.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — every file.

- [ ] **Step 6: Verify the real server boots and serves**

```bash
npm run build && DEV=1 node server.js
```

In another terminal:

```bash
curl -s http://localhost:3000/api/state | head -c 200
curl -s -X POST http://localhost:3000/api/events \
  -H 'Content-Type: application/json' \
  -H 'X-Webhook-Secret: arena-dev-secret' \
  -d '{"type":"ticket.created","agent":"Alpet","service":"KFC","ticketId":"T-1"}'
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/sound/transmission.mp3
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/dev/reset
```

Expected: a JSON snapshot; `{"accepted":true}`; `200`; `200`.

Then confirm the guard actually guards:

```bash
curl -s -X POST http://localhost:3000/api/events -H 'Content-Type: application/json' \
  -H 'X-Webhook-Secret: wrong' -d '{}'
```

Expected: `{"error":"bad secret"}`.

- [ ] **Step 7: Commit**

```bash
git add lib/server/createArenaServer.js lib/server/guards/ensureDay.js lib/server/actions/getState.js lib/http-server.js
git commit -m "refactor: compose backend server from router, guards, actions, services"
```

---

## Task 22: Final verification and cleanup

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Confirm no dead files remain**

Run: `git status --porcelain && ls src/lib 2>/dev/null || echo "src/lib removed"`
Expected: a clean tree, and `src/lib` gone.

- [ ] **Step 2: Confirm nothing still imports the deleted announcer**

Run: `grep -rn "lib/announcer" src tests || echo "no stale imports"`
Expected: `no stale imports`

- [ ] **Step 3: Confirm `App.jsx` is composition only**

Run: `wc -l src/App.jsx`
Expected: well under 100 lines. It should contain no `fetch`, no `EventSource`, no `getBoundingClientRect`, and no `classList`.

Run: `grep -nE "fetch|EventSource|classList|getBoundingClientRect" src/App.jsx || echo "clean"`
Expected: `clean`

- [ ] **Step 4: Run the full suite one more time**

Run: `npm test`
Expected: PASS — every file, including the six new test files.

- [ ] **Step 5: Build and smoke-test production**

```bash
npm run build && node server.js
```

Open `http://localhost:3000?test=1`, arm the speakers, create and resolve tickets, and confirm the leaderboard reorders with the FLIP slide, the score cell pulses, and both overlay and mini banners appear and clear.

- [ ] **Step 6: Update the README architecture note**

Add this section to `README.md` after the `Config` section:

```markdown
## Architecture

The frontend is layered: `src/domain/` holds pure helpers, `src/guards/` holds
predicates that gate effects, `src/services/` wraps browser APIs and the backend
transport, `src/actions/` holds one exported function per user intent, and
`src/hooks/` adapts services to React. `src/App.jsx` is composition only.

The backend mirrors this: `lib/server/router.js` maps method and path onto a
route, each route declares its guards, and each route's action is one file.
`lib/engine.js`, `lib/adapter.js`, and `lib/store.js` remain the domain core.
```

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -m "docs: describe the layered frontend and backend architecture"
```

---

## Self-Review Notes

**Spec coverage.** Every section of `docs/superpowers/specs/2026-07-10-pattern-refactor-design.md` maps to tasks: banners state-driven (Task 12, 17), bottom-up layering (task order), one guards module (Task 4), the `announcer.test.js` harness swap (Task 12), the `JSON.parse` hardening (Task 14), preserved swallow points (Tasks 6, 13), Service/Action/Guard/SRP/Adapter/Composition Root/Strategy (Tasks 5-21), new unit tests per unit (every task), and the six phases (Tasks 1-4, 5-10, 11-12, 13-15, 16-17, 18-21).

**Naming consistency.** `captureOldTops` and `applyFlip` are named identically in `useFlipAnimation` (Task 15) and `App.jsx` (Task 17). `syncSolved` / `resetScores` / `clearScored` / `scoredAgents` match between `useScoreFlash` (Task 15) and `App.jsx` (Task 17). `forCreate` / `forResolve` match between `createTicketIds` (Task 16) and the actions that call them. `announcer` / `current` / `ingestFrame` match between `useAnnouncementQueue` (Task 15) and `App.jsx` (Task 17). The guard contract — `null` to pass, `{ status, json }` or `{ status, text }` to reject — is identical across Tasks 18, 20, and 21.

**Known wrinkle, resolved in Task 21 Step 1.** The original checked the day *before* the webhook secret. Because guards run before actions, the day check became `ensureDayGuard` listed first in the route's guard array rather than a call inside the action. That step walks through the wrong turn and the correction explicitly, so an engineer reading it out of order does not silently reintroduce the bug.
