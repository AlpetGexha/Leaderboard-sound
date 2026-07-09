# Dev Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `npm run dev` start everything needed for local development in one command.

**Architecture:** Keep the current split architecture: Node serves backend routes on port `3000`, Vite serves the frontend on `5173`, and the Vite proxy forwards `/api`, `/events`, and `/sound` to the backend. Change only process orchestration by introducing a cross-platform script runner and wiring `DEV=1` into the backend side of the combined dev command.

**Tech Stack:** npm scripts, Node.js backend, Vite, React, cross-env, concurrently, node:test.

---

## File Structure

- Modify: `package.json`
- Modify: `README.md`
- Add if needed: no new source files

### Task 1: Add The Failing Script Contract Test

**Files:**
- Modify: `package.json`
- Test: local shell verification only

- [ ] **Step 1: Confirm the current script contract is insufficient**

Run:

```powershell
npm.cmd run dev
```

Expected: Vite starts on `127.0.0.1:5173` but proxy requests to `127.0.0.1:3000` fail with `ECONNREFUSED`.

- [ ] **Step 2: Stop the running Vite process after reproducing the issue**

Use `Ctrl+C` in the terminal that ran:

```powershell
npm.cmd run dev
```

Expected: the foreground Vite process exits cleanly.

### Task 2: Change The Dev Scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the failing dependency-based script shape**

Target script shape:

```json
{
  "scripts": {
    "start": "node server.js",
    "dev:server": "cross-env DEV=1 node server.js",
    "dev:client": "vite --host 127.0.0.1",
    "dev": "concurrently -k -n server,client -c yellow,cyan \"npm:dev:server\" \"npm:dev:client\"",
    "build": "vite build",
    "preview": "vite preview --host 127.0.0.1",
    "test": "node --import tsx --test tests/*.test.js"
  }
}
```

- [ ] **Step 2: Add the required packages**

Run:

```powershell
npm.cmd install -D concurrently cross-env
```

Expected: `package.json` and lockfile update with `concurrently` and `cross-env`.

- [ ] **Step 3: Apply the script changes**

Use this exact script block in `package.json`:

```json
{
  "scripts": {
    "start": "node server.js",
    "dev:server": "cross-env DEV=1 node server.js",
    "dev:client": "vite --host 127.0.0.1",
    "dev": "concurrently -k -n server,client -c yellow,cyan \"npm:dev:server\" \"npm:dev:client\"",
    "build": "vite build",
    "preview": "vite preview --host 127.0.0.1",
    "test": "node --import tsx --test tests/*.test.js"
  }
}
```

- [ ] **Step 4: Verify the combined dev command works**

Run:

```powershell
npm.cmd run dev
```

Expected:
- one process starts the backend on port `3000`
- one process starts Vite on port `5173`
- proxy requests no longer fail with `ECONNREFUSED`

- [ ] **Step 5: Stop the combined dev command**

Use `Ctrl+C` in the terminal that ran:

```powershell
npm.cmd run dev
```

Expected: `concurrently` shuts down both child processes because `-k` is enabled.

### Task 3: Update The Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the two-terminal development instructions**

Use this exact README section text:

```md
For frontend development, run one command:

```powershell
npm run dev
```

This starts:

- the backend on `http://127.0.0.1:3000`
- Vite on `http://127.0.0.1:5173`
- backend dev helpers through `DEV=1`

Vite proxies `/api`, `/events`, and `/sound` to the backend on port `3000`.
```

- [ ] **Step 2: Keep production instructions unchanged**

Re-read the Quick Start section and confirm these commands still exist unchanged:

```powershell
npm install
npm run build
npm start
```

Expected: production-style usage remains separate from local dev orchestration.

### Task 4: Full Verification

**Files:**
- Modify if needed: `package.json`, `README.md`

- [ ] **Step 1: Run automated verification**

Run:

```powershell
npm.cmd test
```

Expected: all test files pass.

- [ ] **Step 2: Run build verification**

Run:

```powershell
npm.cmd run build
```

Expected: Vite build completes successfully and updates `dist/`.

- [ ] **Step 3: Run workflow verification**

Run:

```powershell
npm.cmd run dev
```

Expected:
- backend logs show it is listening on `3000`
- Vite shows `http://127.0.0.1:5173/`
- opening the Vite URL does not produce proxy `ECONNREFUSED` errors for `/api/state` or `/events`

- [ ] **Step 4: Commit**

```bash
git add package.json README.md package-lock.json
git commit -m "feat: unify local dev startup"
```

## Self-Review

- Spec coverage: the plan covers one-command startup, `DEV=1`, backend + Vite orchestration, docs, and verification.
- Placeholder scan: no `TODO`, `TBD`, or generic “fix later” instructions remain.
- Type consistency: script names are consistent across all tasks: `dev`, `dev:server`, and `dev:client`.
