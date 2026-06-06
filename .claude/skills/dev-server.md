---
name: dev-server
description: Run the app locally in hot-reload dev mode with Vite + Express + Postgres
---

**Trigger:** User asks to "run", "start", "launch", or "test" the app locally in hot-reload mode.

**Recommended — via Docker Compose (starts Postgres automatically):**
```bash
docker compose up
```
- Vite dev server: `http://localhost:5173` (hot reload)
- Express API: `http://localhost:4000`
- Postgres: `localhost:5432`

**Without Docker (two terminals):**
1. `cd apps/api && npm run dev`  (nodemon, port 4000)
2. `cd apps/web && npm run dev`  (vite, port 5173)

In dev mode the UI and API run on **different ports**, so `CORS_ORIGIN=http://localhost:5173` must be in `apps/api/.env`. In the production Docker image they share the same origin and CORS is not needed.
