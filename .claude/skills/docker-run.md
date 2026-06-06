---
name: docker-run
description: Run the built Docker image in prod mode locally (against real Postgres)
---

**Trigger:** User asks to "run the container", "test the built image", or "run in prod mode locally".

**Via Compose prod override (recommended — also starts Postgres):**
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up
```

**Directly against an existing Postgres:**
```bash
docker run -p 4000:4000 \
  -e DATABASE_URL="postgres://user:pass@host:5432/myfinance" \
  -e PAN_HMAC_SECRET="<secret>" \
  -e JWT_ACCESS_SECRET="<secret>" \
  -e JWT_REFRESH_SECRET="<secret>" \
  -e NODE_ENV=production \
  my-finance:local
```

App serves at `http://localhost:4000` — both UI and API from the same origin (no CORS needed).

Health check: `curl http://localhost:4000/health`
Readiness (checks DB): `curl http://localhost:4000/ready`
