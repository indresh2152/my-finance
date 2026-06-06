---
name: env-setup
description: First-time environment configuration for Docker Compose or manual (no Docker) paths
---

**Trigger:** User says "set up env", "configure environment", or "first-time setup".

**Docker Compose path (recommended):**
1. Copy `.env.example` → `.env` at repo root
2. Fill in secrets: `PAN_HMAC_SECRET`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
3. `docker compose up` — Compose reads `.env` automatically

**Manual path (no Docker):**
1. Copy `apps/api/.env.example` → `apps/api/.env`
2. Copy `apps/web/.env.example` → `apps/web/.env`
3. `npm install` in both dirs
4. `cd apps/api && npm run db:migrate`

**All env vars consumed by the Express server:**

| Variable             | Purpose                                                    | Required in prod |
|----------------------|------------------------------------------------------------|-----------------|
| `DATABASE_URL`       | PostgreSQL connection string                               | Yes             |
| `PAN_HMAC_SECRET`    | HMAC-SHA256 key for PAN hashing — never commit             | Yes             |
| `JWT_ACCESS_SECRET`  | Signing key for access tokens — never commit               | Yes             |
| `JWT_REFRESH_SECRET` | Signing key for refresh tokens — never commit              | Yes             |
| `PORT`               | HTTP port (default: 4000)                                  | No              |
| `NODE_ENV`           | `development` or `production`                              | Yes             |
| `CORS_ORIGIN`        | Allowed origin — **dev only**; omit in container (same-origin) | Dev only   |

Vite build-time vars (`VITE_*`) are baked into the JS bundle at build time, not runtime.
