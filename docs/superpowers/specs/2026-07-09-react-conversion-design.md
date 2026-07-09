# Ticket Arena React Conversion Design

**Date:** 2026-07-09
**Status:** Approved by user request ("Doit")

## Goal

Convert the browser frontend from vanilla DOM scripts to React while preserving the current product behavior and visual design. The backend remains the existing zero-framework Node HTTP server, with the same webhook, state, SSE, TTS, and sound routes.

## Chosen Approach

Use Vite with React for the client application. Source files live under `src/`, the production build writes to `dist/`, and `server.js` serves `dist/` instead of `public/`. The `sound/` directory and backend API contract stay unchanged.

This is a faithful port, not a redesign. The current FPS-style dashboard, leaderboard animation, kill feed, announcement overlays, audio unlock gate, and local test panel remain.

## Architecture

- `src/main.jsx`: React entrypoint.
- `src/App.jsx`: top-level app state, API bootstrapping, SSE lifecycle, day reset handling, and composition.
- `src/components/`: focused UI components for the unlock gate, header, leaderboard, kill feed, announcement banners, and test panel.
- `src/lib/announcer.js`: browser-only announcement queue and audio implementation, adapted from the current `public/js/announcer.js`.
- `src/styles.css`: existing CSS moved into the React bundle with selectors adjusted only where necessary.
- `dist/`: generated Vite output served by the Node server.

## Data Flow

On load, React fetches `GET /api/state`, renders the snapshot, and opens `GET /events` through `EventSource`. Each SSE message replaces the current snapshot, enqueues any announcements, and resets local score-detection state on `dayRolled`.

The test panel continues to post real payloads to `POST /api/events` using the configured or locally saved webhook secret. The reset button still calls `POST /api/dev/reset`.

## Audio Behavior

The browser still requires one user gesture. Clicking the unlock button creates/resumes the audio context, starts background audio if configured, primes speech synthesis, and hides the gate. Announcements remain strictly serial:

1. show banner
2. play transmission/sample/WebAudio stinger
3. play Fish TTS via `/api/tts` when enabled, else speech synthesis
4. hide banner
5. wait before the next item

## Testing

Keep the existing Node backend tests. Replace the old vanilla `tests/app.test.js` with a React-focused test that renders the app in jsdom, verifies snapshot rendering, verifies test-panel fallback data, and verifies stale webhook secret retry behavior. Add Vite build verification so `npm test` plus `npm run build` covers both backend behavior and frontend compilation.

## Out Of Scope

No backend rewrite, no Laravel port, no visual redesign, no historical stats, no auth, and no deployment pipeline changes.
