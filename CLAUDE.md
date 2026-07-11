# Ticket Arena

FPS-style live leaderboard for a support-ticket team. Node HTTP backend +
append-only JSONL store + React/Vite frontend built to `dist/`.
See README.md for the webhook contract, config keys, and kill tiers.

## Commands

```bash
npm run dev     # backend (:3000, DEV=1) + Vite (:5173) together; Vite proxies /api /events /sound
npm test        # node --import tsx --test tests/*.test.js
npm run build   # required before `npm start` — production serves dist/
npm start       # production server on :3000
```

## Module systems (easy to get wrong)

`package.json` has no `"type": "module"`.

- Backend (`server.js`, `lib/**`) is **CommonJS**.
- Frontend (`src/**`) is **ESM**.
- Tests are **CommonJS** and reach ESM source via dynamic import:

```js
require('../src/test/setup');            // must come first
const { fmtTime } = await import('../src/domain/time.js');
```

`src/test/setup.js` installs jsdom and mocks `Audio`, `AudioContext`,
`EventSource`, `speechSynthesis`, and `alert`. Any test touching frontend code
must require it first. Use `global.__resetBrowserMocks()` between tests.

## Layering (keep it)

Frontend: `domain/` pure helpers → `guards/` predicates that gate effects →
`services/` browser+transport adapters → `actions/` one file per user intent →
`hooks/` React adapters. `App.jsx` is composition only.
`services/announcer/createAnnouncer.js` is a composition root: it emits
`onShow`/`onHide` and never touches the DOM.

Backend: `lib/server/router.js` maps method+path to a route; each route declares
guards and one action file. `lib/engine.js`, `adapter.js`, `store.js` are the
domain core. `lib/http-server.js` is a re-export kept as the stable import path.

## Gotchas

- `dist/` is gitignored but two files under it are still tracked, so `git status`
  always shows `dist` churn. Don't "fix" it by committing build output.
- Compose defaults to production (`Dockerfile`). The dev stack is opt-in and must
  be layered on explicitly:
  `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build`.
  Don't rename it back to `docker-compose.override.yml` — Compose auto-merges
  that name and silently turns `docker compose up` into a dev run.
- Audio/speech need a user gesture — the UI gates on `CLICK TO ARM SPEAKERS`.
- `config.json` is the source of truth; `WEBHOOK_SECRET` env overrides
  `config.webhookSecret`. Secrets live in `.env` (see `.env.example`); the
  Fish API key never reaches the browser (`/api/tts` proxies it).
- Dev-only routes (`POST /api/dev/reset`, the `RESET DAY` button) exist only
  when `DEV=1`.
