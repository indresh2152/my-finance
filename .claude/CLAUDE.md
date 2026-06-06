# my-finance — Claude Context

## What this project is

A comprehensive personal finance dashboard for Indian users. The app gives users a single place to view all their financial instruments — credit cards, bank accounts, loans, investments, and insurance policies — all linked through their **PAN (Permanent Account Number)**, the 10-character alphanumeric tax ID issued by India's Income Tax Department.

One core feature is discovering and displaying all credit cards associated with a user's PAN. The broader vision covers the full picture of a user's financial life in India.

Built with React + Vite on the frontend and Node.js (Express) on the backend, backed by PostgreSQL. **Shipped as a single Docker container** — Express serves both the REST API and the built React SPA.

## About PAN (Permanent Account Number)

- Issued by the Income Tax Department of India
- Format: `AAAAA0000A` — 5 uppercase letters, 4 digits, 1 uppercase letter (e.g., `ABCDE1234F`)
- Every individual or entity in India has **exactly one PAN**
- All financial instruments (bank accounts, credit cards, investments, loans, insurance) are seeded with the holder's PAN when opened
- Validation regex: `/^[A-Z]{5}[0-9]{4}[A-Z]$/`
- Display masking: hide the 4 numeric digits → `ABCDE####F`

## Monorepo layout (planned)

```
my-finance/
├── apps/
│   ├── web/               # React + Vite source (dev only; built output is served by api)
│   └── api/               # Node.js Express server
│       └── public/        # ← vite build output copied here at Docker build time
├── docs/
│   └── design/            # Architecture, schema, wireframes, deployment
├── Dockerfile             # Single multi-stage build; output is one container
├── docker-compose.yml     # Local dev: hot-reload Vite + nodemon + Postgres
├── docker-compose.prod.yml# Prod-like local test: built image + Postgres
└── .claude/               # Claude config and skills
```

## Deployment model

- **Single container.** The Dockerfile has three stages: `deps` → `builder` → `runner`.
- `builder` runs `vite build` for `apps/web`, then compiles TypeScript for `apps/api`.
- `runner` copies only the compiled server code + built React static files. Express serves `/api/v1/*` as API and all other routes get `index.html` (SPA catch-all).
- No CORS needed in production — UI and API share the same origin (`http(s)://host:4000`).
- K8s-compatible: stateless, 12-factor config via env vars, `GET /health` and `GET /ready` probes, graceful SIGTERM shutdown, runs as non-root uid 1001.
- Database (PostgreSQL) runs as a **separate** container/pod — never bundled into the app image.

See `docs/design/deployment.md` for the full Dockerfile, Compose files, and K8s notes.

## Key constraints

- **PAN is sensitive.** Never store full PAN in plaintext. Store only HMAC-SHA256 hash (for lookup) and a masked display string (e.g., `ABCDE####F`). Never log PAN in any form.
- **One PAN per user.** Each app user links exactly one PAN. All their financial instruments are fetched via that single PAN profile.
- **India-specific.** Currency is INR (₹). Use Indian number formatting (lakhs/crores). Banks, card networks, and regulatory context are India-specific.
- **Security-first.** All financial data lookups go through authenticated endpoints. Rate-limit PAN registration and lookup routes.
- **No code yet.** Project is in design phase. Do not scaffold code until the user explicitly asks.

## Quality mandates (always active)

These apply to **every line of code written**, with no exceptions:

1. **Unit tests are written in the same session as the code.** No code is shipped untested.
   - Frontend: Vitest + React Testing Library — see `skills/frontend-testing.md`
   - Backend: Jest — see `skills/backend-testing.md`
   - Migrations: Jest against a dedicated test database

2. **Coverage threshold: 80 %** (lines, branches, functions, statements) — enforced identically by the `husky` pre-commit hook and by CI. A commit or PR that drops any metric below 80 % is blocked.

3. **Commit message format** enforced by `commitlint` in the `commit-msg` hook. Format: `type(scope): description`. See `skills/code-quality.md` for the full type/scope list.

4. **ISO-level coding standards** — see `skills/code-quality.md`. Apply to production code, test code, and migration scripts equally.

## Skills

Individual skill files live in `.claude/skills/`:

| Skill | File | When it applies |
|---|---|---|
| `code-quality` | `skills/code-quality.md` | **All code** — ISO-level naming, structure, error handling |
| `frontend` | `skills/frontend.md` | Frontend code — React + MUI v5 |
| `frontend-testing` | `skills/frontend-testing.md` | Frontend tests — Vitest + RTL, 80% coverage |
| `backend` | `skills/backend.md` | Backend code — Express + TypeScript |
| `backend-testing` | `skills/backend-testing.md` | Backend tests — Jest, 80% coverage, migrations |
| `dev-server` | `skills/dev-server.md` | Running hot-reload dev environment |
| `docker-build` | `skills/docker-build.md` | Building the production Docker image |
| `docker-run` | `skills/docker-run.md` | Running the container locally |
| `env-setup` | `skills/env-setup.md` | First-time environment configuration |
| `db-migrate` | `skills/db-migrate.md` | Running database migrations |
| `db-schema` | `skills/db-schema.md` | Inspecting tables and data model |
| `api-test` | `skills/api-test.md` | Testing REST endpoints with curl |
| `compliance` | `skills/compliance.md` | PCI, RBI, DPDP, CERT-In, SOC 2 |
| `security-checklist` | `skills/security-checklist.md` | Pre-PR security gate |

## Design docs

All design artifacts live in `docs/design/`:

| Document | Content |
|---|---|
| `architecture.md` | System architecture and component boundaries |
| `database-schema.md` | Canonical table definitions and relationships |
| `api-contracts.md` | REST API request/response contracts |
| `deployment.md` | Dockerfile, Compose files, K8s notes |
| `compliance.md` | Full PCI, RBI, DPDP, CERT-In, SOC 2 requirements |
| `wireframes.md` | UI wireframes |
| `testing-strategy.md` | Testing approach, stack choices, coverage policy, migration testing |

## Tech stack

| Layer        | Choice                                    |
|--------------|-------------------------------------------|
| Frontend     | React 18 + Vite 5                         |
| Backend      | Node.js 24 LTS + Express                  |
| Database     | PostgreSQL 16 (external container/pod)    |
| Auth         | JWT (access + refresh tokens)             |
| Validation   | Zod (backend), React Hook Form (frontend) |
| ORM/Query    | Drizzle ORM (with raw `pg` for complex queries if needed) |
| Container    | Docker (single image, multi-stage build)  |
| Orchestration| Docker Compose (dev/prod-local); K8s-ready|
