# Docker Compose Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a production-only Docker and Docker Compose setup that builds the frontend, runs the Node server, and persists runtime data.

**Architecture:** Use a single multi-stage Docker image. The build stage installs dependencies and generates `dist/`; the runtime stage installs production dependencies only and serves the built frontend through the existing Node server. Docker Compose runs one `app` service with a named volume for `/app/data` and optional runtime env injection from `.env`.

**Tech Stack:** Docker, Docker Compose, Node 22, Vite, existing Node HTTP server

---

### Task 1: Add Docker build context files

**Files:**
- Create: `.dockerignore`
- Create: `Dockerfile`

- [ ] **Step 1: Write the expected Docker behavior down in the build-context files**

Create `.dockerignore` with the production build exclusions:

```gitignore
node_modules
data
.env
.git
.gitignore
docs
.playwright-cli
coverage
npm-debug.log*
```

Create `Dockerfile` with this target structure:

```dockerfile
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
COPY lib ./lib
COPY config.json ./
COPY sound ./sound
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["npm", "start"]
```

- [ ] **Step 2: Verify the Docker files are not already present**

Run:

```powershell
Test-Path .dockerignore
Test-Path Dockerfile
```

Expected: both return `False` before creation.

- [ ] **Step 3: Add the Docker files**

Write the exact `.dockerignore` and `Dockerfile` contents from Step 1.

- [ ] **Step 4: Verify the files exist**

Run:

```powershell
Get-Item .dockerignore, Dockerfile | Select-Object Name, Length
```

Expected: both files are listed.

### Task 2: Add Docker Compose production orchestration

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Write the failing expectation for Compose support**

Plan to validate these properties after creation:
- one service named `app`
- build context `.` with `Dockerfile`
- published port `3000:3000`
- named volume mounted at `/app/data`
- `env_file: .env`
- restart policy set

- [ ] **Step 2: Verify the Compose file does not already exist**

Run:

```powershell
Test-Path docker-compose.yml
```

Expected: `False`.

- [ ] **Step 3: Add the Compose file**

Create `docker-compose.yml` with:

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    env_file:
      - .env
    volumes:
      - ticket_arena_data:/app/data
    restart: unless-stopped

volumes:
  ticket_arena_data:
```

- [ ] **Step 4: Verify the Compose file contents**

Run:

```powershell
Get-Content docker-compose.yml
```

Expected: output matches the service and volume structure above.

### Task 3: Document the production container workflow

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Write the documentation expectation**

Add a production Docker section that explains:
- `docker compose up --build -d`
- app URL `http://localhost:3000`
- how to stop with `docker compose down`
- how to keep data in the named volume
- that `.env` is loaded by Compose at runtime

- [ ] **Step 2: Add the README update**

Insert a concise section like:

```markdown
## Docker Compose Production

Build and run the production container stack:

```powershell
docker compose up --build -d
```

The app will be available at `http://localhost:3000`.

Stop the stack with:

```powershell
docker compose down
```

Runtime data is stored in the `ticket_arena_data` Docker volume mounted at `/app/data`, so event history and TTS cache survive container restarts. Runtime secrets such as `FISH_API_KEY` and `WEBHOOK_SECRET` can be provided through `.env`, which Docker Compose loads without baking it into the image.
```

- [ ] **Step 3: Verify the README section exists**

Run:

```powershell
rg -n "Docker Compose Production|docker compose up --build -d|ticket_arena_data" README.md
```

Expected: all three strings are found.

### Task 4: Verify the container workflow end to end

**Files:**
- Verify: `Dockerfile`
- Verify: `docker-compose.yml`
- Verify: `README.md`

- [ ] **Step 1: Build the image**

Run:

```powershell
docker compose build
```

Expected: successful image build with frontend production build completing inside Docker.

- [ ] **Step 2: Start the production stack**

Run:

```powershell
docker compose up -d
```

Expected: the `app` service starts successfully.

- [ ] **Step 3: Verify the HTTP app responds from the container**

Run:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/api/state | Select-Object -ExpandProperty StatusCode
```

Expected: `200`.

- [ ] **Step 4: Stop the stack after verification**

Run:

```powershell
docker compose down
```

Expected: containers stop cleanly while the named volume remains.

### Task 5: Run repository verification

**Files:**
- Verify: `tests/*.test.js`
- Verify: `dist/`

- [ ] **Step 1: Run the automated test suite**

Run:

```powershell
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Run the production frontend build locally**

Run:

```powershell
npm run build
```

Expected: Vite build completes successfully and refreshes `dist/`.

- [ ] **Step 3: Review the final diff**

Run:

```powershell
git status --short
```

Expected: only the intended Dockerization files and related generated build updates remain.
