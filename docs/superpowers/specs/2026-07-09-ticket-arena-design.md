# Ticket Arena — Design Spec

**Date:** 2026-07-09
**Status:** Approved by user

A gamified, FPS-"First Blood"-style live leaderboard for a 5-person support-ticket team. Every ticket event triggers an announcer voice line + synthesized stinger + fullscreen banner, and a live-updating daily leaderboard ranked by tickets solved.

Pattern heritage: the announcement-queue + audio-unlock + overlay-synced-to-sound design is adapted from the user's prior project `github.com/0x4m4/first-strike-alert` (CTFd first-blood announcer). Its weaknesses (triple transport: Socket.IO + polling + meta-refresh; recompute-everything diffing; hardcoded single sound) are deliberately fixed here.

## Decisions (from user interrogation)

| Question | Decision |
|---|---|
| Ticket source | Webhook from a not-yet-decided internal tool → define a clean generic webhook contract |
| Deploy target | Office TV / dashboard PC on LAN; one always-on browser tab with speakers |
| Day reset | Midnight Europe/Tirane (calendar day) |
| Sounds | Web Speech API (SpeechSynthesis) for voice lines + WebAudio-synthesized stingers; no audio files required; registry allows MP3 swap later |
| Kill tiers | Daily cumulative total (2nd solve of day = Double Kill, etc.) |
| Tie-break | First to reach the count ranks higher |
| Reopened tickets | Ignored — once counted, always counted; resolve dedup by ticketId |
| Testing | Test panel with buttons that POST real events through the production pipeline |
| Stack | Zero-dependency Node.js server (built-in `http`), SSE for live updates, vanilla JS frontend |
| Future | User may port backend to Laravel — ticket-event layer must be an isolated, swappable seam |

## Architecture

```
leaderboard-sound/
├── server.js              # HTTP + SSE broadcast + static file serving (zero npm deps)
├── config.json            # agents, tiers, timezone, webhook secret, port, services list
├── lib/
│   ├── store.js           # append-only event log → data/events.jsonl; replay today's events on boot
│   ├── engine.js          # PURE logic: today's events → leaderboard + announcement decisions
│   └── adapter.js         # inbound webhook payload → validated internal event (THE SWAP SEAM)
├── data/events.jsonl      # one JSON line per event (gitignored)
└── public/
    ├── index.html         # leaderboard + announcement overlay + audio-unlock gate + test panel
    ├── css/styles.css     # dark FPS/arena theme, animations
    └── js/
        ├── app.js         # EventSource client, state render, FLIP rank animations, kill feed
        └── announcer.js   # announcement queue + WebAudio stingers + SpeechSynthesis voice
```

### API contract (the Laravel-swappable seam)

- `POST /api/events` — header `X-Webhook-Secret: <config.secret>`; body:
  `{ "type": "ticket.created" | "ticket.resolved", "agent": "<name>", "service": "<string>", "ticketId": "<string>" }`
  Server stamps the timestamp. Unknown agent / bad type / bad secret → 4xx, event dropped.
- `GET /api/state` — current day's leaderboard, first-blood info, recent feed (for initial render).
- `GET /events` — SSE stream; server pushes `{ state, announcements[] }` after each accepted event, and a `day-rolled` message at midnight.

The frontend depends only on these three routes. A Laravel port reimplements them and keeps `public/` unchanged. Internal events downstream of `adapter.js` never see the external payload shape.

### Data & persistence

Append-only `data/events.jsonl`: `{ id, type, agent, service, ticketId, ts }`. On boot, store replays only events whose Europe/Tirane calendar date is today. No database. Engine state is derived, never stored.

## Game rules

- **Day** = calendar date in Europe/Tirane, computed via `Intl.DateTimeFormat` with that timeZone (no TZ libraries). A midnight timer (checked each minute) rolls the day: board resets to zero, first-blood becomes available again.
- **Agents** (config): Alpet, Bajram, Kushtrim, Mirlind, Ermira. Events for unknown agents are rejected.
- **ticket.created**:
  - First of the day → **FIRST BLOOD**: dramatic stinger + voice "First blood on [SERVICE] by [NAME]" + fullscreen red banner.
  - Otherwise → notify blip + voice "New ticket by [NAME]" + small banner.
  - Duplicate `ticketId` for created events is ignored.
- **ticket.resolved**:
  - Dedup: a `ticketId` counts at most once ever (per log history for the day; re-resolve after reopen is ignored).
  - A resolve does NOT require a prior created event (tickets may predate the system).
  - Increments the agent's daily solve count; fires the tier announcement for the count reached.

### Kill tiers (daily cumulative)

| Count | Name | Voice line |
|---|---|---|
| 1 | Solved | "Ticket solved by [NAME]" |
| 2 | DOUBLE KILL | "Double kill! [NAME]" |
| 3 | TRIPLE KILL | "Triple kill! [NAME]" |
| 4 | KILLING SPREE | "[NAME] is on a killing spree!" |
| 5 | UNSTOPPABLE | "[NAME] is unstoppable!" |
| 7 | RAMPAGE | "[NAME] is on a rampage!" |
| 10 | GODLIKE | "[NAME] is GODLIKE!" |
| 15 | MONSTER KILL | "M-M-M-MONSTER KILL! [NAME]" |

### Ranking

Sort by daily solved count desc; tie-break: the agent who **reached that count earlier** ranks higher (timestamp of their latest counted resolve). All five agents always shown, including zeros.

## Announcer (frontend)

- **Queue**: strictly one announcement at a time (pattern from first-strike-alert). Each item: play stinger → speak voice line via SpeechSynthesis → banner visible for the duration → hide on speech `end` (with a max-duration fallback timeout) → 1.2 s gap → next.
- **Stingers**: WebAudio-synthesized (no asset files): deep dramatic hit for First Blood; soft blip for new ticket; rising arpeggio that escalates in intensity per tier. Defined in a registry `eventKind → stingerRecipe` so any entry can later be replaced by an MP3 `<audio>` source with a one-line change.
- **Audio unlock**: fullscreen "CLICK TO ARM SPEAKERS" gate on load; first click resumes AudioContext and primes speechSynthesis (browser autoplay policy).
- **Banner**: fullscreen overlay for First Blood and high tiers; compact top banner for blips; synced with sound.

## Leaderboard UI

- Dark arena theme, high-contrast, readable from across a room on a TV (large type, generous spacing).
- Rank rows: FLIP animation on position change; glow pulse on the row that just scored; streak badge (flame) at 3+ solves; #1 gets a crown/highlight treatment.
- Kill-feed ticker: last ~8 events with relative times.
- Header shows day/date and First Blood holder.
- Reconnect handling: EventSource auto-reconnects; on reconnect, refetch `/api/state`.

## Test panel

Hidden panel toggled with `T` key or `?test=1`: per-agent **New ticket** and **Resolve** buttons plus a service selector; buttons POST real payloads to `/api/events` (with the configured secret), exercising the full production pipeline. Auto-generates unique ticketIds. Includes a dev-only "reset day" action (`POST /api/dev/reset`, enabled only when server runs with `DEV=1`).

## Error handling

- Webhook: 401 wrong secret, 400 malformed/unknown agent, 200 accepted-but-duplicate (idempotent).
- Server never crashes on bad input; malformed jsonl lines are skipped on replay with a warning.
- Frontend: SSE drop → reconnect + state refetch; speechSynthesis failure → banner still shows with fallback timeout.
- HTML-escape all rendered strings (agent, service, ticketId).

## Testing strategy

- `lib/engine.js` is pure → unit tests with `node:test` (first blood, tiers, dedup, tie-break, day boundary).
- `lib/store.js` replay/day-filter tests against a temp file.
- End-to-end: test panel buttons through a running server.

## Out of scope (YAGNI)

Auth/user accounts, historical stats/weekly boards, admin UI, mobile layout polish, per-agent avatars, actual helpdesk integration (arrives later via the webhook contract).
