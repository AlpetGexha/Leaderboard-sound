# Pattern Refactor Design

Date: 2026-07-10

## Problem

Two files carry most of the codebase's complexity.

`src/App.jsx` (347 lines) holds five components plus the root. The root component mixes four unrelated concerns: SSE transport and initial state fetch, deduplication of announcement IDs, FLIP row-reorder animation, and score-pulse tracking. `TestPanel` inlines `fetch`, a 401-retry-with-default-secret dance, and a ticket-ID sequencer.

`src/lib/announcer.js` (333 lines) is a single closure with six responsibilities: profile merging, WebAudio synthesis, MP3 sample playback, TTS fetching, DOM banner manipulation, and queue sequencing. It reaches into the DOM directly through refs that `App.jsx` passes down via `getOverlayElements`.

`lib/http-server.js` (214 lines) is an if-chain that inlines routing, auth, body parsing, static file serving, SSE, and day-roll scheduling.

The backend's `adapter` → `engine` → `store` layering is already sound and stays.

## Scope and Constraints

Frontend (`src/`) refactors first, backend (`lib/`) second, as two independently mergeable phases. The codebase stays plain JavaScript — no TypeScript migration. The existing test suite is the safety net and gates every commit.

## Decisions

**Banners become state-driven React.** The announcer emits `onShow(announcement)` and `onHide()` instead of writing to DOM nodes. A `useAnnouncementQueue` hook holds the current announcement in state; `<AnnouncementOverlay>` and `<MiniBanner>` render from props. The announcer becomes a pure audio/queue service with zero DOM access. The four refs, the `AnnouncementLayers` component, and `getOverlayElements` are deleted.

**Approach is layered bottom-up extraction.** Leaf-level pure modules first (`domain/`, `guards/`), then services that depend on them, then hooks, then thin components. Each phase lands as its own commit with the full suite green. The announcer's sequencer — the riskiest piece, with interlocking `await` timings that tests pin precisely — moves last, after the audio primitives it calls are independently tested.

**Guards live in one cohesive module.** `src/guards/announcementGuards.js` exports `createDedupeGuard()`, `isBigAnnouncement()`, and `canSpeak()`. All three guard the same domain object, so three six-line files would be import noise without cohesion benefit.

## Test Impact

`tests/announcer.test.js` constructs the announcer as `createAnnouncer({ getOverlayElements: () => nodes })`. The state-driven banner decision removes that parameter, so that file's harness must change: the constructor call and its four fake DOM nodes are swapped for `onShow`/`onHide` spies. Its twelve behavioral assertions — transmission lead time, sample-versus-stinger precedence, TTS ordering, the 2-second queue gap — stay byte-identical. This is the only existing test whose setup changes.

Every other test file compiles untouched. `tests/engine.test.js`, `tests/adapter.test.js`, `tests/store.test.js`, `tests/fish-tts.test.js`, and `tests/server.test.js` pass unchanged because `engine.js`, `adapter.js`, `store.js`, `fish-tts.js`, and the `createArenaServer` import path all keep their exact public API. `tests/app.test.js` passes unchanged, including its dedupe test — which is why the dedupe guard is extracted with its 200/100 LRU cap intact rather than reimplemented.

## Target Structure

```
src/
  domain/       announcement.js  snapshot.js  time.js      ← pure, no deps
  guards/       announcementGuards.js                      ← predicates + dedupe LRU
  services/
    arenaApi.js         eventStream.js                     ← transport adapters
    audio/    audioElement.js  audioContext.js  stingers.js  samples.js  ttsClient.js
    announcer/ profile.js  queue.js  createAnnouncer.js    ← composition root
  actions/      createTicket.js  resolveTicket.js  resetDay.js
  hooks/        useArenaSnapshot  useAnnouncementQueue  useFlipAnimation
                useScoreFlash  useHotkey
  components/   Header  Leaderboard  KillFeed  UnlockGate
                AnnouncementOverlay  MiniBanner  TestPanel/
  App.jsx                                                  ← composition only
```

## Pattern Mapping

**Service** — `arenaApi`, `eventStream`, and everything under `services/audio/` and `services/announcer/`. On the backend, `arenaState` (day plus snapshot plus `ensureCurrentDay`), `sseHub` (client set, broadcast, keepalive), and `staticFiles`.

**Action** — the three files in `src/actions/`, each one exported async function taking its dependencies as arguments, so `TestPanel` stops owning `fetch` and secret-retry logic. On the backend, one action per route: `ingestEvent`, `getState`, `tts`, `sse`, `resetDay`.

**Guard** — `createDedupeGuard` (the stateful LRU), `isBigAnnouncement`, and `canSpeak` on the frontend. On the backend, `webhookSecretGuard`, `devOnlyGuard`, and `jsonBodyGuard`, declared per route. `adapter.parseWebhook` is already a guard and stays as one.

**SRP** — the announcer's six jobs become ten modules averaging roughly forty lines, each with one reason to change.

Beyond the four patterns named in the goal, three more fit:

**Adapter** wraps `EventSource` and `HTMLAudioElement`. This is what makes the audio layer testable without jsdom element stubs, and it is the reason phase 2 must precede phase 3.

**Composition Root** is `createAnnouncer` on the frontend and `createArenaServer` on the backend — the only places where concrete dependencies are wired to interfaces.

**Strategy** governs sample-versus-synthesized-stinger selection, which today is an `if` chain inside `playStinger`, and route handler dispatch, which today is the `http-server.js` if-chain.

## Data Flow

`eventStream.js` wraps `EventSource` behind `subscribe(handlers) → unsubscribe`, so nothing above it knows the transport. `useArenaSnapshot()` calls it, calls `arenaApi.fetchState()` on mount and on reconnect, and returns `{ snapshot, live }`.

`useAnnouncementQueue(announcer)` receives the announcement array off each SSE frame, runs each item past the dedupe guard, enqueues survivors, and holds `current` in React state. `App.jsx` renders `current` through `isBigAnnouncement(current) ? <AnnouncementOverlay/> : <MiniBanner/>`.

The announcer calls `onShow` when it dequeues and `onHide` in its `finally` — exactly where `showBanner` and `hideBanners` are called today — so visual timing is preserved to the millisecond.

`TestPanel`'s inline `postTestEvent`, 401-retry dance, and ticket-ID sequencer become `actions/createTicket.js` and `actions/resolveTicket.js`, each taking `{ api, secretStore, ticketIds }`. The open-ticket map and sequence counter move into a small `ticketIds` service so the retry logic can be unit-tested without rendering a component.

## Error Handling

The current code deliberately swallows several failures: `fetch('/api/state').catch(() => {})`, `playAudio`'s `started.catch(() => {})`, and `stopAudio`'s empty catch. Every one of these swallow points is preserved — the audio ones exist because browsers reject `play()` for reasons the app cannot act on. What changes is that they move to the adapter boundary (`audioElement.js`, `arenaApi.js`) instead of being scattered, and each gets a one-line comment stating the constraint. The `err.statusCode` convention in `fish-tts.js` stays, and the backend `ttsAction` keeps reading it.

One behavior is fixed rather than preserved. `es.onmessage` does a bare `JSON.parse(event.data)` with no try/catch, so a malformed frame throws inside the EventSource callback and silently kills announcement processing for that frame. Wrapping it in `eventStream.js` is a one-line change that belongs to this refactor because that is the module being created.

## New Tests

Each extracted unit arrives with unit tests: `announcementGuards` (dedupe cap boundary, big/small classification, empty voice line), `domain/announcement` (`voiceLine` title-prefix stripping), `stingers` (returns expected durations), `ttsClient` (URL parameter construction), and `actions/*` (the 401 retry path, without React). On the backend, `router` (method and path matching, guard short-circuit) and each guard in isolation.

## Phases

Six commits, each with the suite green.

1. **`domain/` and `guards/`** — pure extraction of `fmtTime`, `agentsFrom`, `servicesFrom`, `EMPTY_STATE`, `voiceLine`, `sampleFallbackMs`, and `isBigAnnouncement`, plus the dedupe LRU pulled out of `App.jsx`. No behavior change, no signature change.

2. **`services/audio/`** — `audioElement` (make, play, stop, measure), `audioContext` (context plus `tone` plus `noiseHit`), `stingers`, `samples`, `ttsClient`. `announcer.js` imports them and shrinks to profile, queue, and banners.

3. **`services/announcer/`** — `profile.js`, `queue.js`, `createAnnouncer.js`. This is where `getOverlayElements` becomes `onShow`/`onHide` and where `announcer.test.js`'s harness changes. Highest-risk commit, isolated.

4. **`hooks/`, `services/arenaApi`, `services/eventStream`** — `App.jsx`'s effect decomposes. `useFlipAnimation` and `useScoreFlash` absorb the `useLayoutEffect`.

5. **`components/` and `actions/`** — one file per component, `TestPanel` splits into three, the three actions land, `App.jsx` drops to composition.

6. **Backend** — `lib/server/` with router, guards, actions, and services. `http-server.js` becomes a thin re-export so `tests/server.test.js` keeps importing `createArenaServer` from the same path.

Phases 1 through 5 are frontend and land first. Phase 6 is independently mergeable and touches no `src/` file.

## Success Criteria

`App.jsx` drops from 347 lines to composition only. `announcer.js` becomes ten focused modules. `npm test` passes at every one of the six commits. No production behavior changes except the `JSON.parse` hardening in `eventStream.js`.
