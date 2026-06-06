---
name: db-migrate
description: Run database migrations (auto on startup) or manually via npm script
---

**Trigger:** User asks to "run migrations", "set up the database", or "apply schema".

Migrations run **automatically on app startup** via `runMigrations()` called before `app.listen`. Manual migration is only needed when you want to migrate without restarting the server (rare).

**Manual (Compose Postgres):**
```bash
docker compose exec api npm run db:migrate
```

**Directly (outside Docker):**
1. Ensure `DATABASE_URL` is set in `apps/api/.env`
2. `cd apps/api && npm run db:migrate`

Dev seed runs automatically in `NODE_ENV=development` on startup. To run it manually: `npm run db:seed`.
