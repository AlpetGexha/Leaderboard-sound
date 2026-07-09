# React Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Ticket Arena's browser UI from vanilla DOM scripts to React without changing backend behavior or the API contract.

**Architecture:** Add a Vite React app under `src/`, build it to `dist/`, and make the existing Node server serve that build directory. Move the announcer queue into a browser-side React helper while keeping the same state snapshots, SSE messages, audio unlock behavior, test panel, and visual styling.

**Tech Stack:** Node.js, CommonJS backend, Vite, React, React DOM, `node:test`, jsdom, Testing Library.

---

## File Structure

- Modify `package.json`: add React/Vite dependencies, build/dev scripts, and keep `npm test`.
- Add `index.html`: Vite HTML entrypoint for React.
- Add `vite.config.js`: React plugin config and test environment setup.
- Add `src/main.jsx`: React root bootstrap.
- Add `src/App.jsx`: top-level state, API fetch, SSE connection, and UI composition.
- Add `src/lib/announcer.js`: announcement queue and browser audio implementation.
- Add `src/styles.css`: current stylesheet imported by React.
- Add `src/test/setup.js`: jsdom browser API shims for React tests.
- Replace `tests/app.test.js`: React app behavior tests replacing the old VM-based vanilla script tests.
- Modify `server.js`: serve `dist/` when present.
- Modify `README.md`: update frontend implementation and scripts.

## Task 1: Tooling And Build Contract

**Files:**
- Modify: `package.json`
- Add: `index.html`
- Add: `vite.config.js`

- [ ] **Step 1: Write the failing build-contract check**

Run:

```powershell
npm run build
```

Expected before implementation: `npm ERR! Missing script: "build"`.

- [ ] **Step 2: Add React/Vite scripts and dependencies**

Use:

```powershell
npm install react react-dom
npm install -D @vitejs/plugin-react vite jsdom @testing-library/react @testing-library/dom
```

Set scripts in `package.json`:

```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "vite --host 127.0.0.1",
    "build": "vite build",
    "preview": "vite preview --host 127.0.0.1",
    "test": "node --test"
  }
}
```

- [ ] **Step 3: Add Vite entry files**

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Ticket Arena</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>T</text></svg>" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

`vite.config.js`:

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/events': 'http://127.0.0.1:3000',
      '/sound': 'http://127.0.0.1:3000'
    }
  }
});
```

- [ ] **Step 4: Verify tooling**

Run:

```powershell
npm run build
```

Expected after later source tasks exist: Vite produces `dist/`.

## Task 2: React App Tests

**Files:**
- Add: `src/test/setup.js`
- Replace: `tests/app.test.js`

- [ ] **Step 1: Write React behavior tests before porting the app**

Test cases:

- initial snapshot renders leaderboard agents, default services, and the unlock gate
- stale saved webhook secret retries once with `arena-dev-secret`

Run:

```powershell
node --test tests/app.test.js
```

Expected before implementation: failure because `src/App.jsx` does not exist.

- [ ] **Step 2: Add jsdom setup**

Provide DOM globals, `localStorage`, `EventSource`, WebAudio, `Audio`, and speech synthesis shims in `src/test/setup.js`.

- [ ] **Step 3: Verify tests fail for missing React app**

Run:

```powershell
node --test tests/app.test.js
```

Expected: module import failure for `../src/App.jsx`.

## Task 3: Announcer Helper

**Files:**
- Add: `src/lib/announcer.js`

- [ ] **Step 1: Move announcer behavior into a factory**

Export `createAnnouncer({ getOverlayElements })`, returning `{ configure, unlock, enqueue }`. Keep the existing queue order, sample/transmission support, Fish TTS route, WebAudio stingers, and SpeechSynthesis fallback.

- [ ] **Step 2: Keep DOM access injectable**

The helper reads overlay nodes through `getOverlayElements()` so tests can render React without initializing real audio.

## Task 4: React Components And State

**Files:**
- Add: `src/main.jsx`
- Add: `src/App.jsx`
- Add: `src/styles.css`

- [ ] **Step 1: Implement the React app to satisfy tests**

Use `useEffect` for initial `GET /api/state` and `EventSource('/events')`. Store the snapshot in React state. Configure the announcer when snapshots include `config.announcer`.

- [ ] **Step 2: Preserve leaderboard score animation**

Use refs to capture row positions before snapshot replacement and animate changed rows after render. Track previous solved counts in a ref to add the `scored` class when an agent's count increases.

- [ ] **Step 3: Preserve test panel behavior**

Populate agents/services from snapshot config with existing fallback values. Retry exactly once with `arena-dev-secret` after a 401 response from `POST /api/events`.

- [ ] **Step 4: Import the existing CSS**

Move the current CSS into `src/styles.css`, keep selectors stable, and adjust only for React structure.

- [ ] **Step 5: Verify React tests pass**

Run:

```powershell
node --test tests/app.test.js
```

Expected: both app tests pass.

## Task 5: Server Build Serving

**Files:**
- Modify: `server.js`
- Modify if needed: `lib/http-server.js`

- [ ] **Step 1: Point production static serving at `dist`**

Set `publicDir` to `path.join(__dirname, 'dist')` in `server.js`. Keep `soundDir` unchanged.

- [ ] **Step 2: Keep SPA fallback behavior**

The existing `serveFileFrom(..., 'index.html')` behavior should continue serving the React app for `GET /`.

## Task 6: Documentation And Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README**

Document:

- `npm install`
- `npm run build`
- `npm start`
- `npm run dev` for frontend development with backend proxy
- React/Vite frontend source now lives in `src/`

- [ ] **Step 2: Run full verification**

Run:

```powershell
npm test
npm run build
```

Expected: all Node tests pass and Vite build succeeds.

- [ ] **Step 3: Optional local smoke**

Run:

```powershell
npm start
```

Open `http://localhost:3000?test=1`, unlock audio, and use the test panel to create and resolve tickets.

## Self-Review

- Spec coverage: The plan covers React source structure, backend static serving, audio behavior, SSE, test panel, CSS preservation, docs, tests, and build verification.
- Placeholder scan: No `TBD`, `TODO`, or unspecified implementation steps remain.
- Type consistency: Snapshot, announcement, and config property names match the existing backend responses.
