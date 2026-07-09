# Dev Workflow Design

**Date:** 2026-07-10
**Status:** Drafted for user review

## Goal

Make `npm run dev` start everything needed for local development in one command so the project runs without a second terminal.

## Chosen Approach

`npm run dev` will launch:

1. the Node backend server
2. Vite for the React frontend
3. dev-mode backend behavior via `DEV=1`

This keeps the current architecture intact. The backend still owns `/api`, `/events`, and `/sound`, and Vite still proxies those routes to port `3000`.

## Scope

- Update `package.json` scripts so `npm run dev` starts both processes together.
- Keep a backend-only script for cases where only the Node server is needed.
- Update `README.md` so the local development instructions match the new workflow.

## Behavior

- `npm run dev` should be sufficient to open `http://127.0.0.1:5173/` and have the proxy work immediately.
- The backend should run with `DEV=1` so local-only helpers such as `/api/dev/reset` continue working during development.
- If either process exits, the combined dev command should stop cleanly rather than leaving a half-running workflow behind.

## Implementation Notes

- Add a small process runner dependency instead of relying on shell-specific background syntax.
- Keep `npm start` unchanged for production-style backend serving.
- Keep Vite proxy config unchanged because the issue is startup orchestration, not proxy routing.

## Testing

- Verify `npm run dev` starts both services.
- Verify `GET /api/state` is reachable through Vite without connection-refused proxy errors.
- Run `npm test` and `npm run build` after the script changes to confirm no regression in the existing project contract.

## Out Of Scope

- No backend rewrite into Vite middleware.
- No changes to the API contract.
- No deployment or production script changes beyond keeping them working.
