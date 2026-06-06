# Deployment Design

## Overview

`my-finance` ships as a **single Docker image**. Express serves both the REST API (`/api/v1/*`) and the pre-built React SPA (catch-all → `index.html`). PostgreSQL always runs as a separate container or managed service — never bundled into the app image.

The container is designed to be K8s-compatible from day one, even though the initial target is Docker Compose.

---

## Dockerfile (annotated)

```dockerfile
# ─── Stage 1: deps ────────────────────────────────────────────────────────────
# Install all npm workspace dependencies in one layer so the next stages
# can copy node_modules without re-downloading.
FROM node:24-alpine AS deps
WORKDIR /app

# Copy only package manifests first — maximises Docker layer caching.
# Reinstall only when a package.json or package-lock.json changes.
COPY package.json package-lock.json ./
COPY apps/web/package.json  ./apps/web/
COPY apps/api/package.json  ./apps/api/

RUN npm ci

# ─── Stage 2: builder ─────────────────────────────────────────────────────────
# Build the React SPA and compile the TypeScript server.
FROM deps AS builder
WORKDIR /app

COPY . .

# 1. Build the React app → apps/web/dist/
RUN npm run build -w apps/web

# 2. Compile the Express server TypeScript → apps/api/dist/
RUN npm run build -w apps/api

# 3. Copy the built SPA into the server's static directory so Express can serve it.
RUN cp -r apps/web/dist apps/api/public

# ─── Stage 3: runner ──────────────────────────────────────────────────────────
# Minimal production image — only compiled JS + static files + prod node_modules.
# No source code, no devDependencies, no TypeScript compiler.
FROM node:24-alpine AS runner
WORKDIR /app

# Create a non-root user. Never run production containers as root.
RUN addgroup -g 1001 -S nodejs \
 && adduser  -u 1001 -S nodejs -G nodejs

# Copy only what the server needs at runtime.
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/dist    ./dist
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/public  ./public

# Install production dependencies only (no devDeps).
COPY --chown=nodejs:nodejs apps/api/package.json ./
RUN npm ci --omit=dev

USER nodejs

EXPOSE 4000

# Metadata labels — useful for image registries and audit tooling.
LABEL org.opencontainers.image.title="my-finance" \
      org.opencontainers.image.description="India personal finance dashboard" \
      org.opencontainers.image.source="https://github.com/your-org/my-finance"

CMD ["node", "dist/app.js"]
```

### Express static-serving and SPA catch-all

The compiled server (`dist/app.ts`) must include these two blocks **after** all API routes:

```typescript
// Serve the built React app's static assets
app.use(express.static(path.join(__dirname, '../public')));

// SPA catch-all: any GET that isn't an API route gets index.html
// so React Router can handle client-side navigation.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});
```

### Graceful shutdown

The server must handle `SIGTERM` (sent by Docker/K8s on pod termination) to avoid dropped requests:

```typescript
process.on('SIGTERM', async () => {
  server.close(async () => {
    await db.end();       // close PostgreSQL pool
    process.exit(0);
  });
});
```

---

## Database Initialization on Startup

The Express server applies migrations and seeds dev data automatically before it starts accepting traffic. No manual pre-flight step is needed in the deploy pipeline.

### Startup sequence

```
Container starts
    │
    ├─► runMigrations()       ← apply pending SQL migrations (Drizzle Kit / node-pg-migrate)
    │       │ failure → process.exit(1) → container restarts (Docker/K8s restart policy)
    │       │                             GET /ready returns 503 until next successful start
    │
    ├─► seedDevData()         ← NODE_ENV=development only; no-op in production
    │       └─ INSERT INTO users ... ON CONFLICT DO NOTHING
    │          creates devuser / dev@example.com / devpass123 if users table is empty
    │
    └─► app.listen(PORT)      ← now serving; GET /ready returns 200
```

### Why auto-migrate instead of a pre-job

- Single container model — there is no separate init container or migration job in the Compose setup.
- K8s path: once the team adds a K8s Job for migrations, `runMigrations()` becomes a no-op because migrations will already be applied. The guard is a version check; if no pending migrations exist the function returns immediately.
- Fail-fast: a broken migration surfaces immediately at startup rather than silently serving stale schema.

---

## Environment Variables

All configuration is injected at runtime via environment variables (12-factor). **No secrets are baked into the image.**

| Variable             | Example value                                    | Required | Notes                                          |
|----------------------|--------------------------------------------------|----------|------------------------------------------------|
| `DATABASE_URL`       | `postgres://user:pass@postgres:5432/myfinance`   | Yes      | Use K8s Secret in prod                         |
| `PAN_HMAC_SECRET`    | (random 32-byte hex)                             | Yes      | Use K8s Secret in prod; never commit to git    |
| `JWT_ACCESS_SECRET`  | (random 32-byte hex)                             | Yes      | Use K8s Secret in prod                         |
| `JWT_REFRESH_SECRET` | (random 32-byte hex)                             | Yes      | Use K8s Secret in prod                         |
| `PORT`               | `4000`                                           | No       | Defaults to 4000                               |
| `NODE_ENV`           | `production`                                     | Yes      | Controls Express error verbosity               |
| `CORS_ORIGIN`        | `http://localhost:5173`                          | Dev only | Omit in production (same-origin, no CORS needed)|

---

## docker-compose.yml — Local Development

Hot-reload mode: Vite dev server + nodemon + Postgres.

```yaml
# docker-compose.yml
services:

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER:     myfinance
      POSTGRES_PASSWORD: myfinance
      POSTGRES_DB:       myfinance
    volumes:
      - pg_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U myfinance"]
      interval: 5s
      retries: 5

  api:
    build:
      context: .
      target: deps         # use the deps stage — has source mounted, no build step
    working_dir: /app/apps/api
    command: npm run dev   # nodemon
    volumes:
      - ./apps/api:/app/apps/api
      - /app/apps/api/node_modules
    ports:
      - "4000:4000"
    env_file: .env
    environment:
      NODE_ENV:     development
      DATABASE_URL: postgres://myfinance:myfinance@postgres:5432/myfinance
      CORS_ORIGIN:  http://localhost:5173
    depends_on:
      postgres:
        condition: service_healthy

  web:
    build:
      context: .
      target: deps
    working_dir: /app/apps/web
    command: npm run dev -- --host  # vite, expose to host
    volumes:
      - ./apps/web:/app/apps/web
      - /app/apps/web/node_modules
    ports:
      - "5173:5173"
    depends_on:
      - api

volumes:
  pg_data:
```

---

## docker-compose.prod.yml — Prod-like Local Test

Builds the final image and runs it alongside Postgres — mirrors production.

```yaml
# docker-compose.prod.yml  (used with: docker compose -f docker-compose.yml -f docker-compose.prod.yml up)
services:

  # Override the api service to use the final built image instead of dev mode
  api:
    build:
      context: .
      target: runner       # final production stage
    command: node dist/app.js
    volumes: []            # no source mounts in prod
    environment:
      NODE_ENV:    production
      CORS_ORIGIN: ""      # same-origin in prod; unset this var

  # The web service is no longer needed — Express serves the SPA
  web:
    profiles: ["dev-only"] # prevents this service from starting in prod mode
```

Usage:
```bash
# Build the image
docker build -t my-finance:local .

# Run prod-like with Compose (Postgres + built image)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up
```

App available at `http://localhost:4000` (UI + API, same origin).

---

## Kubernetes — Future Deployment

The container requires no changes to run in K8s. The following manifests are starting points.

### Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: my-finance-secrets
type: Opaque
stringData:
  DATABASE_URL:        "postgres://user:pass@postgres-svc:5432/myfinance"
  PAN_HMAC_SECRET:     "<generate with: openssl rand -hex 32>"
  JWT_ACCESS_SECRET:   "<generate with: openssl rand -hex 32>"
  JWT_REFRESH_SECRET:  "<generate with: openssl rand -hex 32>"
```

### ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-finance-config
data:
  NODE_ENV: "production"
  PORT:     "4000"
```

### Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-finance
spec:
  replicas: 2
  selector:
    matchLabels:
      app: my-finance
  template:
    metadata:
      labels:
        app: my-finance
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
      containers:
        - name: my-finance
          image: your-registry/my-finance:latest
          ports:
            - containerPort: 4000
          envFrom:
            - configMapRef:
                name: my-finance-config
            - secretRef:
                name: my-finance-secrets
          livenessProbe:
            httpGet:
              path: /health
              port: 4000
            initialDelaySeconds: 10
            periodSeconds: 15
          readinessProbe:
            httpGet:
              path: /ready
              port: 4000
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            requests:
              cpu:    "100m"
              memory: "128Mi"
            limits:
              cpu:    "500m"
              memory: "512Mi"
```

### Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-finance-svc
spec:
  selector:
    app: my-finance
  ports:
    - port: 80
      targetPort: 4000
  type: ClusterIP
```

Add an `Ingress` resource (nginx-ingress or cloud LB) to expose the service externally with TLS.

---

## Image Build and Tag Convention

```
my-finance:<git-sha>       # immutable, used in K8s manifests
my-finance:latest          # floating tag, for local use only — never deploy latest to prod
my-finance:v1.2.3          # semantic version tag for releases
```

Build and tag for a registry:
```bash
docker build -t your-registry/my-finance:$(git rev-parse --short HEAD) .
docker push  your-registry/my-finance:$(git rev-parse --short HEAD)
```

---

## .dockerignore

```
node_modules
**/node_modules
**/dist
**/public
.env
.env.*
.git
.claude
docs
*.md
```

Keeps the build context small — only source files and package manifests are sent to the daemon.
