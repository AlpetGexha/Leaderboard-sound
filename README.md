# Ticket Arena

FPS-style live leaderboard for a 5-person support-ticket team. Helpdesk webhook events update a daily leaderboard, trigger SSE broadcasts, play synthesized stingers, speak announcer lines, and show fullscreen or mini banners in the browser.

The app keeps a small backend: a Node.js HTTP server, append-only JSONL storage, and a React/Vite frontend built into `dist/`.

## Quick Start

```powershell
npm install
npm run build
npm start
```

Open `http://localhost:3000`, then click `CLICK TO ARM SPEAKERS`. Browsers require a user gesture before WebAudio and speech playback can start.

For frontend development, run the backend in one terminal and Vite in another:

```powershell
npm start
npm run dev
```

Vite serves `http://127.0.0.1:5173` and proxies `/api`, `/events`, and `/sound` to the backend on port `3000`.

Run tests with:

```powershell
npm test
```

On Windows, use `npm test` or `node --test`. Do not use `node --test tests/`; newer Node versions treat the directory argument as a module path on Windows.

The React source lives in `src/`. The production server serves the generated `dist/` directory, so run `npm run build` after frontend changes before using `npm start` for the production build.

## Webhook Contract

Send ticket events to:

```text
POST /api/events
Content-Type: application/json
X-Webhook-Secret: arena-dev-secret
```

Accepted event types:

- `ticket.created`
- `ticket.resolved`

Payload fields:

- `type`: one of the accepted event types.
- `agent`: support agent name, matched case-insensitively and stored with canonical config casing.
- `ticketId`: required, coerced to a trimmed string.
- `service`: optional company/source name, defaults to `General`.

Example:

```powershell
curl.exe -X POST http://localhost:3000/api/events `
  -H "Content-Type: application/json" `
  -H "X-Webhook-Secret: arena-dev-secret" `
  -d "{\"type\":\"ticket.resolved\",\"agent\":\"Kushtrim\",\"service\":\"KFC\",\"ticketId\":\"T-1042\"}"
```

Responses return `{ "accepted": true }` when the event changed game state. Duplicate created ticket IDs, duplicate resolved ticket IDs, unknown agents, and unknown types are rejected or ignored by the engine.

## Config

`config.json` is the source of truth:

- `port`: HTTP port, default `3000`.
- `timezone`: timezone used for daily board boundaries, default `Europe/Tirane`.
- `webhookSecret`: shared secret for `X-Webhook-Secret`.
- `agents`: leaderboard agents in default display order.
- `services`: company/source names shown in the local test panel.
- `announcements`: editable announcement titles and lines. Lines support `{name}`, `{agent}`, `{service}`, `{ticketId}`, `{type}`, and `{count}` placeholders.
- `announcer`: browser sound profile for voice tuning, background audio, and event sample files.

For deployment, prefer setting `WEBHOOK_SECRET` in the environment. It overrides `config.webhookSecret`.

## Custom Announcer Audio

Local audio files in `sound/` are served under `/sound/...`. The default profile measures the mapped event sample, starts `sound/transmission.mp3` as a quieter lead-in for 1.5 seconds, then starts the event sample while the transmission cue is still playing. The transmission cue is stopped after the event sample, generated WebAudio impact, and dynamic spoken line finish.

Dynamic voice lines are generated server-side through Fish Audio when `FISH_AUDIO_SECRET` or `FISH_API_KEY` is present in `.env`. The browser calls the local `/api/tts` route; it never sees the Fish API key. Generated MP3s are cached in `data/tts-cache/`.

Edit `config.json` to change the experience:

- `announcer.transmission.src`: lead-in cue, such as `/sound/transmission.mp3`.
- `announcer.transmission.leadMs`: milliseconds to play the transmission cue before the event sample starts. The default is `1500`.
- `announcer.samples`: per-event MP3s. Supported keys include `first_blood`, `new_ticket`, `solved`, `double_kill`, `triple_kill`, `killing_spree`, `unstoppable`, `rampage`, `godlike`, and `monster_kill`.
- `announcer.tts`: enables Fish-generated voice playback for dynamic names and services.
- `announcer.voice`: browser text-to-speech fallback tuning if Fish TTS fails.
- `announcements.templates` and `announcements.tiers`: custom lines for ticket and CTF logic using placeholders like `{sound}`, `{title}`, `{name}`, and `{service}`.
- `fishAudio.voices.solved`: Fish voice model for resolved-ticket announcements.
- `fishAudio.voices.first_blood`: Fish voice model for first-blood announcements.

## Local Test Panel

Open `http://localhost:3000?test=1` to show the test panel immediately, or press `T` while the app is open.

The panel can create and resolve test tickets for each configured agent. It uses the same `POST /api/events` webhook route as real integrations.

The `RESET DAY` button only works when the server is started in dev mode:

```powershell
$env:DEV='1'; node server.js
```

## Daily Reset And Persistence

Events are appended to `data/events.jsonl`, which is gitignored. On startup, the server rebuilds today's state by replaying events whose timestamps fall on the current day in `config.timezone`.

Every 30 seconds, the server checks the configured timezone day key. When the day changes, it resets in-memory state and broadcasts a live board reset. Old log entries remain in `data/events.jsonl`; they are ignored for the new day.

## Kill Tiers

Resolved ticket counts trigger tier announcements at exact milestones:

| Solved | Title |
| ---: | --- |
| 1 | SOLVED |
| 2 | DOUBLE KILL |
| 3 | TRIPLE KILL |
| 4 | KILLING SPREE |
| 5 | UNSTOPPABLE |
| 7 | RAMPAGE |
| 10 | GODLIKE |
| 15 | MONSTER KILL |

First `ticket.created` of the day triggers `FIRST BLOOD`. Later created tickets trigger `NEW TICKET`.

## Frontend Routes

The production frontend only depends on these backend routes:

- `POST /api/events`: ingest webhook events.
- `GET /api/state`: fetch the current snapshot.
- `GET /events`: receive live Server-Sent Events.

`POST /api/dev/reset` is a local development helper and only exists when `DEV=1`.

## Laravel Port Note

To port the backend to Laravel, keep the built frontend contract unchanged and reimplement the three production routes above with the same JSON shapes:

- Validate and normalize incoming webhooks using the adapter contract.
- Apply events with the same game-engine rules: first blood, duplicate rejection, resolved counts, tier milestones, feed limit, and tie-break order.
- Serve `GET /api/state` snapshots and `GET /events` SSE broadcasts in the same format the React frontend already consumes.
