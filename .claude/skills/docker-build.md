---
name: docker-build
description: Build the production Docker image (multi-stage: deps → builder → runner)
---

**Trigger:** User asks to "build the Docker image", "build the container", or "create the image".

```bash
docker build -t my-finance:local .
```

The multi-stage Dockerfile (3 stages):
1. `deps` — installs all npm workspace dependencies
2. `builder` — runs `vite build` (apps/web) + `tsc` (apps/api); copies web `dist/` → `apps/api/public/`
3. `runner` — copies only compiled server + static files; prod-only deps; runs as uid 1001 (non-root)

Verify:
```bash
docker images my-finance
```
