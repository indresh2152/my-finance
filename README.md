# my-finance

A personal finance dashboard for Indian users. Link your PAN (Permanent Account Number) once and view all your financial instruments — credit cards, bank accounts, loans, investments, and insurance policies — in a single place.

---

## Features

- **PAN-linked aggregation** — one PAN registration surfaces all linked financial instruments
- **Credit cards** — limit, available credit, utilisation, billing cycle
- **Bank accounts** — savings, current, FD, RD, NRE/NRO with balances
- **Loans** — home, personal, auto, education, gold, business loans with EMI details
- **Investments** — mutual funds, stocks, PPF, NPS, bonds with P&L
- **Insurance** — life, health, vehicle, home policies with renewal dates
- **Audit log** — every data access recorded; users can inspect their own history
- **DPDP-compliant** — right-to-erasure and right-to-access (data export) built in

---

## Tech stack

| Layer        | Choice                                            |
|--------------|---------------------------------------------------|
| Frontend     | React 18 + Vite 5, React Router v6, React Query   |
| Styling      | Tailwind CSS, `en-IN` locale for INR formatting   |
| Forms        | React Hook Form + Zod                             |
| Backend      | Node.js 24 LTS + Express + TypeScript             |
| Validation   | Zod (backend schemas)                             |
| ORM          | Drizzle ORM (raw `pg` for complex queries)        |
| Auth         | JWT (access token in memory + HttpOnly refresh cookie) |
| Database     | PostgreSQL 16                                     |
| Container    | Docker — single multi-stage image                 |

---

## Repository layout

```
my-finance/
├── apps/
│   ├── web/               # React + Vite source (dev only)
│   └── api/               # Node.js Express server
│       └── public/        # Vite build output (copied at image build time)
├── docs/
│   └── design/            # Architecture, schema, wireframes, deployment, compliance
├── Dockerfile             # Multi-stage build → single production image
├── docker-compose.yml     # Local dev: Vite + nodemon + Postgres (hot reload)
└── docker-compose.prod.yml# Prod-like test: built image + Postgres
```

---

## Getting started

### Prerequisites

- Node.js 24 LTS
- Docker + Docker Compose
- PostgreSQL 16 (or use the Compose-managed container)

### Environment variables

Copy the example file and fill in secrets:

```bash
cp apps/api/.env.example .env
```

| Variable             | Required | Notes                                              |
|----------------------|----------|----------------------------------------------------|
| `DATABASE_URL`       | Yes      | `postgres://user:pass@localhost:5432/myfinance`    |
| `PAN_HMAC_SECRET`    | Yes      | `openssl rand -hex 32` — never commit              |
| `JWT_ACCESS_SECRET`  | Yes      | `openssl rand -hex 32`                             |
| `JWT_REFRESH_SECRET` | Yes      | `openssl rand -hex 32`                             |
| `NODE_ENV`           | Yes      | `development` or `production`                      |
| `PORT`               | No       | Defaults to `4000`                                 |
| `CORS_ORIGIN`        | Dev only | `http://localhost:5173` — omit in production       |

### Run in development (hot reload)

```bash
docker compose up
```

- Frontend (Vite HMR): `http://localhost:5173`
- API (nodemon): `http://localhost:4000`
- Postgres: `localhost:5432`

A dev seed user is created automatically on first start:

| Field    | Value             |
|----------|-------------------|
| username | `devuser`         |
| email    | `dev@example.com` |
| password | `devpass123`      |

### Run without Docker

```bash
npm install
# terminal 1
cd apps/api && npm run dev
# terminal 2
cd apps/web && npm run dev
```

---

## Build and deploy

### Build the production image

```bash
docker build -t my-finance:local .
```

The multi-stage Dockerfile:
1. **deps** — installs all npm workspace dependencies
2. **builder** — runs `vite build` and `tsc`, then copies the SPA into `apps/api/public/`
3. **runner** — minimal Alpine image with compiled server JS + built SPA, runs as uid 1001

### Run prod-like locally

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up
```

App available at `http://localhost:4000` — UI and API on the same origin, no CORS.

### Tag for a registry

```bash
docker build -t your-registry/my-finance:$(git rev-parse --short HEAD) .
docker push  your-registry/my-finance:$(git rev-parse --short HEAD)
```

### Kubernetes

The container is K8s-compatible out of the box:

| Probe         | Endpoint   | Behaviour                            |
|---------------|------------|--------------------------------------|
| Liveness      | `GET /health` | Fast; no DB call                 |
| Readiness     | `GET /ready`  | Verifies DB connection is open   |

Secrets (`DATABASE_URL`, `PAN_HMAC_SECRET`, JWT secrets) must be supplied via K8s Secrets — never baked into the image. See [docs/design/deployment.md](docs/design/deployment.md) for example manifests.

---

## API overview

Base URL: `/api/v1` · Auth: `Authorization: Bearer <accessToken>`

All monetary values are INR (`number`, 2 decimal places). Financial endpoints require a registered PAN; without one they return `403 PAN_NOT_REGISTERED`.

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/health` | Liveness probe |
| `GET`  | `/ready`  | Readiness probe |
| `POST` | `/api/v1/auth/register` | Create account |
| `POST` | `/api/v1/auth/login` | Sign in, get tokens |
| `POST` | `/api/v1/auth/refresh` | Rotate access token |
| `POST` | `/api/v1/auth/logout` | Revoke refresh token |
| `POST` | `/api/v1/pan/register` | Link PAN to account |
| `GET`  | `/api/v1/pan` | Get masked PAN |
| `GET`  | `/api/v1/overview` | Net-worth snapshot |
| `GET`  | `/api/v1/credit-cards` | All credit cards |
| `GET`  | `/api/v1/credit-cards/:cardId` | Card detail |
| `GET`  | `/api/v1/bank-accounts` | All bank accounts |
| `GET`  | `/api/v1/loans` | All loans |
| `GET`  | `/api/v1/investments` | All investments |
| `GET`  | `/api/v1/insurance` | All insurance policies |
| `GET`  | `/api/v1/users/me` | User profile |
| `PATCH`| `/api/v1/users/me` | Update password/email |
| `DELETE`| `/api/v1/users/me` | Initiate account erasure (DPDP) |
| `GET`  | `/api/v1/users/me/data-export` | Request data export (DPDP) |
| `GET`  | `/api/v1/audit-logs` | Own audit trail |

Full request/response shapes: [docs/design/api-contracts.md](docs/design/api-contracts.md)

---

## Database schema

PostgreSQL 16 with UUID primary keys and `TIMESTAMPTZ` timestamps (UTC). All monetary values are `NUMERIC(15,2)` in INR.

| Table                | Purpose |
|----------------------|---------|
| `users`              | Accounts (bcrypt password, DPDP consent tracking, soft-delete) |
| `pan_profiles`       | One PAN per user — stored as HMAC-SHA256 hash only |
| `credit_cards`       | Cards linked to a PAN; card number stored as HMAC + last 4 |
| `bank_accounts`      | Savings, current, FD, RD, NRE/NRO |
| `loans`              | All loan accounts; account number stored as HMAC + last 4 |
| `investments`        | MF, stocks, PPF, NPS, bonds |
| `insurance_policies` | Life, health, vehicle, home; policy number as HMAC + masked display |
| `refresh_tokens`     | SHA-256 token hashes with expiry and revocation |
| `audit_logs`         | Append-only; 180-day minimum retention (CERT-In 2022) |
| `data_requests`      | DPDP export and erasure request queue |

Full DDL and ERD: [docs/design/database-schema.md](docs/design/database-schema.md)

### Sensitive data handling

| Field | Stored as | Displayed as |
|-------|-----------|--------------|
| PAN | HMAC-SHA256 | `ABCDE####F` only |
| Card number | HMAC-SHA256 | Last 4 digits |
| Bank account number | HMAC-SHA256 | Last 4 digits |
| Loan account number | HMAC-SHA256 | Last 4 digits |
| Insurance policy number | HMAC-SHA256 | Masked, e.g. `LIC****9012` |
| Password | bcrypt (cost 12) | Never |
| Refresh token | SHA-256 | Never |

---

## Testing

### Run tests

```bash
# Frontend (Vitest + React Testing Library)
cd apps/web
npx vitest run --coverage      # single run — 80% gate
npx vitest                     # watch mode

# Backend (Jest + Supertest)
cd apps/api
npx jest --coverage            # single run — 80% gate
npx jest --watch               # watch mode
```

### Coverage policy

80% minimum on lines, branches, functions, and statements — enforced by:

1. **`pre-commit` hook** — blocks the commit if coverage drops below threshold
2. **CI pipeline** — blocks PR merge

The same `vite.config.ts` / `jest.config.ts` configuration is used in both places.

### Migration tests

Every SQL migration has a co-located test file that verifies the migration applies cleanly, the schema is correct, and the migration is idempotent. Migration tests run against a dedicated `TEST_DATABASE_URL` — never dev or prod.

### Commit message format

Enforced by `commitlint` in the `commit-msg` hook:

```
type(scope): description
```

See [.claude/skills/code-quality.md](.claude/skills/code-quality.md) for the full type/scope list.

Full testing strategy: [docs/design/testing-strategy.md](docs/design/testing-strategy.md)

---

## Security and compliance

| Framework | Scope |
|-----------|-------|
| PCI DSS v4.0 | Credit card metadata storage and access logging |
| RBI Digital Payment Security Controls (2021) | India payment app mandatory directive |
| RBI Data Localisation (2018) | PostgreSQL must run in an India-region data centre |
| DPDP Act 2023 | PAN and all financial data are personal/sensitive data |
| CERT-In Directions (2022) | 6-hour incident reporting; 180-day log retention in India |
| SOC 2 Type II | Security, Availability, Confidentiality, Privacy |
| OWASP ASVS Level 2 | Application security verification baseline |

Key mitigations: rate limiting on auth and PAN registration endpoints; access token in memory only (not `localStorage`); refresh token in `HttpOnly; SameSite=Strict` cookie; all financial reads scoped to the authenticated user's PAN; every API access written to `audit_logs`.

Full compliance detail: [docs/design/compliance.md](docs/design/compliance.md)

---

## Design documents

| Document | Content |
|----------|---------|
| [architecture.md](docs/design/architecture.md) | System architecture, component boundaries, request pipeline |
| [database-schema.md](docs/design/database-schema.md) | Full DDL, ERD, audit log design |
| [api-contracts.md](docs/design/api-contracts.md) | REST request/response contracts |
| [deployment.md](docs/design/deployment.md) | Dockerfile, Compose files, K8s manifests |
| [wireframes.md](docs/design/wireframes.md) | ASCII wireframes for all pages |
| [testing-strategy.md](docs/design/testing-strategy.md) | Testing pyramid, coverage policy, commit gates |
| [compliance.md](docs/design/compliance.md) | PCI, RBI, DPDP, CERT-In, SOC 2 requirements |
