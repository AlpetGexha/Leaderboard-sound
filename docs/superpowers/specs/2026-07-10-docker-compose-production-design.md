# Docker Compose Production Design

**Date:** 2026-07-10
**Status:** Drafted for user review

## Goal

Make the project deployable for production with Docker Compose using a single containerized application service.

## Chosen Approach

Use one multi-stage `Dockerfile` and one `docker-compose.yml` service:

1. a build stage installs dependencies and runs `vite build`
2. a runtime stage runs `node server.js`
3. Docker Compose publishes port `3000` and mounts persistent application data

This fits the current architecture. The Node server already serves the built frontend, `/api`, `/events`, `/sound`, and `/api/tts`, so there is no need to split Nginx and Node into separate services.

## Scope

- Add a production multi-stage `Dockerfile`.
- Add `docker-compose.yml` for one `app` service.
- Add `.dockerignore` to keep the build context small and avoid copying local junk into the image.
- Persist `data/` with a Compose volume so event history and TTS cache survive container restarts.
- Document production build and startup commands in `README.md`.

## Runtime Behavior

- `docker compose up --build -d` should produce a runnable application on port `3000`.
- The container should build the frontend during image creation and serve the generated `dist/` assets from the existing Node server.
- Runtime configuration should come from `config.json` plus environment variables provided through Compose.
- `.env` should stay outside the image and be injected at runtime through Compose rather than copied into the build context.

## Container Design

- Base image: Node 22.
- Build stage:
  - copy package manifests
  - install dependencies with `npm ci`
  - copy source files
  - run `npm run build`
- Runtime stage:
  - install only production dependencies
  - copy `server.js`, `lib/`, `config.json`, `sound/`, and built `dist/`
  - create and use a writable `data/` directory
  - start with `npm start`

## Docker Compose Design

- One service named `app`.
- Port mapping: `3000:3000`.
- Restart policy enabled for unattended production use.
- Named volume mounted at `/app/data`.
- Optional `env_file: .env` support so Fish Audio or webhook secrets can be injected without editing the image.

## Error Handling

- If `FISH_API_KEY` is absent, the app should still start and return the existing TTS error behavior when `/api/tts` is used.
- If `WEBHOOK_SECRET` is absent from the environment, the existing `config.json` fallback should continue to work.
- If the `data/` volume is empty, the app should create the needed files on first start through the existing store logic.

## Testing

- Build the image successfully with Docker.
- Start the stack with Docker Compose.
- Verify `GET /api/state` returns `200` from the containerized app.
- Run `npm test` and `npm run build` in the workspace after the Docker changes to make sure the repository still passes its existing checks.

## Out Of Scope

- No development hot-reload container flow.
- No Nginx or reverse-proxy split.
- No orchestration beyond Docker Compose.
- No Kubernetes manifests, CI deployment pipeline, or cloud-specific configuration.
