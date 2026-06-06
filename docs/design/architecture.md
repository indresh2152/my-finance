# Application Architecture

## Overview

`my-finance` is a comprehensive personal finance dashboard for Indian users. It gives users one place to see all their financial instruments — credit cards, bank accounts, loans, investments, and insurance policies — all linked through their **PAN (Permanent Account Number)**, the 10-character tax ID issued by India's Income Tax Department (format: `AAAAA0000A`, e.g., `ABCDE1234F`).

Credit card discovery by PAN is one of the core features. The system is structured as a monorepo with a React SPA frontend and a REST API backend.

---

## High-Level Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                            Browser                              │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │              React + Vite SPA (port 5173)               │   │
│   │                                                         │   │
│   │  Login │ Overview │ Cards │ Bank │ Loans │ Invest │ Ins  │   │
│   └──────────────────────────┬──────────────────────────────┘   │
└──────────────────────────────│──────────────────────────────────┘
                               │ HTTPS / JSON REST
┌──────────────────────────────▼──────────────────────────────────┐
│                 Node.js Express API (port 4000)                  │
│                                                                  │
│  /auth  /overview  /credit-cards  /bank-accounts  /loans        │
│                    /investments   /insurance       /users        │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                      Service Layer                         │  │
│  │  AuthService | OverviewService | CardService | BankService │  │
│  │  LoanService | InvestmentService | InsuranceService        │  │
│  └─────────────────────────────┬──────────────────────────────┘  │
│                                │                                 │
│  ┌─────────────────────────────▼──────────────────────────────┐  │
│  │               Data Access Layer (DAL)                      │  │
│  │              Drizzle ORM / raw pg queries                  │  │
│  └─────────────────────────────┬──────────────────────────────┘  │
└─────────────────────────────────│───────────────────────────────┘
                                  │ TCP / SQL
┌─────────────────────────────────▼───────────────────────────────┐
│                        PostgreSQL 16                            │
│                                                                  │
│  users | pan_profiles | credit_cards | bank_accounts | loans    │
│  investments | insurance_policies | refresh_tokens | audit_logs │
└─────────────────────────────────────────────────────────────────┘
```

---

## Frontend Architecture

### Tech
- **React 18** with functional components and hooks
- **Vite 5** as the build tool and dev server
- **React Router v6** for client-side routing
- **React Query (TanStack Query)** for server state / caching
- **React Hook Form + Zod** for form validation
- **Axios** for HTTP client
- **MUI v5 (Material UI)** for styling and component library
- **i18next + react-i18next** for internationalisation — all UI strings sourced from `apps/web/src/locales/<lang>/<namespace>.json`
- **Intl.NumberFormat with `en-IN` locale** for Indian number formatting (₹5,00,000)

### Pages and Routes

| Route                     | Component              | Auth | Description                                           |
|---------------------------|------------------------|------|-------------------------------------------------------|
| `/login`                  | `LoginPage`            | No   | Username + password login                             |
| `/`                       | `OverviewPage`         | Yes  | Financial overview — net worth, all instruments summary |
| `/credit-cards`           | `CreditCardsPage`      | Yes  | All credit cards linked to user's PAN                 |
| `/credit-cards/:cardId`   | `CardDetailPage`       | Yes  | Full details of a single credit card                  |
| `/bank-accounts`          | `BankAccountsPage`     | Yes  | All bank accounts linked to user's PAN                |
| `/loans`                  | `LoansPage`            | Yes  | All loans (home, personal, auto, etc.)                |
| `/investments`            | `InvestmentsPage`      | Yes  | Mutual funds, stocks, PPF, NPS, bonds                 |
| `/insurance`              | `InsurancePage`        | Yes  | Life, health, vehicle, home insurance policies        |
| `/profile`                | `ProfilePage`          | Yes  | User profile and PAN registration                     |
| `/pan-register`           | `PanRegisterPage`      | Yes  | First-time PAN registration gate; shown when `hasPan: false` on login or redirected from a financial endpoint returning 403 PAN_NOT_REGISTERED |

### State Management

- **Server state** (API data): React Query — no Redux/Zustand for remote data
- **UI/local state**: `useState` / `useReducer` — no global store needed
- **Auth state**: React Context (`AuthContext`) — holds JWT + user info + PAN masked display

---

## Backend Architecture

### Tech
- **Node.js 24 LTS** with TypeScript
- **Express.js** — lightweight, well-understood
- **Zod** — request validation and schema definition
- **Drizzle ORM** — type-safe SQL, or raw `pg` if simpler
- **jsonwebtoken** — JWT access/refresh token handling
- **bcrypt** — password hashing
- **express-rate-limit** — rate limiting on sensitive endpoints
- **helmet** + **cors** — security headers
- **i18next + i18next-fs-backend** — internationalisation; all `error.message` strings sourced from `apps/api/src/locales/<lang>.json`; language detected from `Accept-Language` header via `localeMiddleware`

### Folder Structure

```
apps/api/
├── src/
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── overview.routes.ts
│   │   ├── credit-cards.routes.ts
│   │   ├── bank-accounts.routes.ts
│   │   ├── loans.routes.ts
│   │   ├── investments.routes.ts
│   │   ├── insurance.routes.ts
│   │   └── users.routes.ts
│   ├── controllers/          (mirror of routes/)
│   ├── services/             (mirror of routes/)
│   ├── db/
│   │   ├── schema.ts          (Drizzle schema)
│   │   ├── migrations/
│   │   └── index.ts
│   ├── middleware/
│   │   ├── auth.middleware.ts
│   │   ├── audit.middleware.ts    ← logs every /api/v1/* request to audit_logs
│   │   ├── validate.middleware.ts
│   │   └── rateLimit.middleware.ts
│   ├── utils/
│   │   ├── pan.utils.ts       (validate PAN format, compute HMAC, produce masked string)
│   │   ├── currency.utils.ts  (INR formatting helpers)
│   │   └── token.utils.ts
│   └── app.ts
├── .env.example
└── package.json
```

---

## Request Pipeline (Middleware Order)

Every request through Express passes through middleware in this sequence. Order is critical — audit middleware must come after auth so `req.user` is populated.

```
Incoming HTTP request
        │
        ▼
  helmet()              — security headers (CSP, HSTS, X-Frame-Options, …)
        │
        ▼
  cors()                — dev only (same-origin in production; CORS_ORIGIN env var)
        │
        ▼
  express.json()        — parse JSON body
        │
        ▼
  localeMiddleware      — sets req.language from Accept-Language header (fallback: 'en')
        │
        ▼
  rateLimiter           — global or route-specific (express-rate-limit)
        │
        ▼
  auth.middleware       — verifies JWT; sets req.user (undefined on public routes)
        │
        ▼
  audit.middleware      — registers res.on('finish') handler to write audit_logs
        │                  skips /health and /ready
        │                  maps route pattern → audit_action enum value
        │                  never throws; failure goes to stderr only
        ▼
  route handlers        — business logic, DB queries, response
        │
        ▼
  res.on('finish') fires — audit INSERT runs after response is sent to client
```

**Key points:**
- `localeMiddleware` runs before `rateLimiter` so that rate-limit error messages can be translated via `req.language`.
- `/health` and `/ready` are excluded from audit logging — they are probe endpoints, not user actions.
- Route handlers do **not** call `auditLog()` directly; the middleware handles all routes automatically.
- Adding a new route only requires adding one entry to `ROUTE_ACTION_MAP` in `audit.middleware.ts` — no risk of forgetting to log.
- Failed logins (`POST /auth/login` returning 401) are recorded as `USER_LOGIN_FAILED` rather than `USER_LOGIN`, distinguished by checking `res.statusCode` inside the finish handler. `user_id` is NULL in `audit_logs` for these rows (the user was not authenticated); the column is nullable to allow this.

---

## PAN (Permanent Account Number) — Key Facts

| Property         | Detail                                                         |
|------------------|----------------------------------------------------------------|
| Issuer           | Income Tax Department, Government of India                     |
| Format           | `AAAAA0000A` — 5 letters + 4 digits + 1 letter (10 chars total)|
| Example          | `ABCDE1234F`                                                   |
| Uniqueness       | One PAN per individual/entity; cannot have more than one       |
| Validation regex | `/^[A-Z]{5}[0-9]{4}[A-Z]$/`                                   |
| Masked display   | Replace the 4 numeric digits with `#` → `ABCDE####F`           |
| Storage          | HMAC-SHA256 hash only — full PAN never persisted               |
| Purpose in app   | Acts as the lookup key to find all linked financial instruments |

---

## Authentication Flow

```
1. User submits username + password
2. API validates credentials, returns:
   - accessToken  (JWT, 15 min TTL, payload: userId, roles)
   - refreshToken (JWT, 7 day TTL, stored in HttpOnly cookie)
3. Frontend stores accessToken in memory (NOT localStorage)
4. On expiry, silent refresh via /api/v1/auth/refresh using cookie
5. Logout: clear cookie server-side, discard in-memory token
```

---

## Compliance Scope

For full detail on each framework see `docs/design/compliance.md`.

| Compliance Framework                          | Scope in this app                                          |
|-----------------------------------------------|------------------------------------------------------------|
| PCI DSS v4.0                                  | Credit card metadata storage and display                   |
| RBI Digital Payment Security Controls (2021)  | India payment app mandatory directive                      |
| RBI Data Localisation (2018)                  | PostgreSQL **must** run in an India-region data centre      |
| DPDP Act 2023                                 | PAN and all financial data are personal/sensitive data      |
| CERT-In Directions (2022)                     | 6-hour incident reporting; 180-day log retention in India   |
| SOC 2 Type II                                 | Security, Availability, Confidentiality, Privacy criteria  |
| ISO 27001                                     | ISMS governance; key management; secure SDLC               |
| SEBI / IRDAI data guidelines                  | Investment and insurance data masking and access controls  |
| OWASP ASVS Level 2                            | Application security verification baseline                 |

---

## Security Risk Mitigations

| Risk                              | Mitigation                                                      |
|-----------------------------------|-----------------------------------------------------------------|
| PAN exposure in logs              | PAN never logged — not even masked form                         |
| PAN exposure in DB                | Only HMAC-SHA256 hash stored; masked string for display only    |
| PAN format bypass                 | Zod validates `/^[A-Z]{5}[0-9]{4}[A-Z]$/` before any DB op    |
| Account number exposure           | Only last 4 digits stored; full numbers hashed                  |
| SQL injection                     | Parameterized queries via Drizzle / pg                          |
| Brute-force login                 | Rate limit: 5 attempts / min per IP                             |
| PAN registration abuse            | Rate limit: 3 PAN registrations / day per user account          |
| CSRF                              | SameSite=Strict on refresh cookie; no state-changing GETs       |
| Token theft (XSS)                 | Access token in memory only; refresh in HttpOnly cookie         |
| Over-fetching financial data      | All instruments scoped to authenticated user's PAN only         |
| Sensitive fields in audit metadata| Never put PAN, account numbers, or policy numbers in JSONB logs |
| Stack trace / internals leakage   | Global Express error middleware returns only generic 500 shape; stack never in response body |
| Vulnerable dependencies           | `npm audit` at pre-commit, CI merge gate, and Docker build; Dependabot weekly PRs |

---

## Deployment Architecture

### Single-Container Model

The application ships as **one Docker image**. Express serves both the REST API and the pre-built React SPA. There is no separate frontend container.

```
┌──────────────────────────────────────────────────────────────┐
│                Docker Image: my-finance                      │
│                                                              │
│   ┌──────────────────────────────────────────────────────┐  │
│   │              Node.js Express (port 4000)             │  │
│   │                                                      │  │
│   │  GET /health          → 200 OK (liveness probe)      │  │
│   │  GET /ready           → 200 OK if DB reachable        │  │
│   │  /api/v1/*            → REST API handlers            │  │
│   │  /static/* (assets)   → express.static(public/)      │  │
│   │  GET * (catch-all)    → public/index.html (SPA)      │  │
│   └──────────────────────────────────────────────────────┘  │
│                        │                                     │
│   ┌────────────────────▼─────────────────────────────────┐  │
│   │               apps/api/public/                       │  │
│   │   (React SPA built by Vite — baked in at image build) │  │
│   │   index.html  |  assets/*.js  |  assets/*.css        │  │
│   └──────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
              │ TCP 5432
┌─────────────▼────────────────────────────────────────────────┐
│      PostgreSQL (separate container / K8s pod / managed DB)  │
└──────────────────────────────────────────────────────────────┘
```

**Why single container:**
- Simpler deployment — one image to build, tag, push, and run
- No CORS in production — UI and API share the same origin (`https://host:4000`)
- React Router works via the Express SPA catch-all: any non-API `GET` request returns `index.html`
- Database always runs separately — never bundled into the app image

---

### Multi-Stage Dockerfile Overview

```
Stage 1: deps
  node:24-alpine
  Install all npm workspace deps (apps/web + apps/api)

Stage 2: builder
  Copy source + node_modules from deps
  Run: npm run build -w apps/web   → apps/web/dist/
  Run: npm run build -w apps/api   → apps/api/dist/
  Copy: apps/web/dist/ → apps/api/public/

Stage 3: runner  ← final image
  node:24-alpine (fresh, minimal)
  Copy: apps/api/dist/  (compiled server JS)
  Copy: apps/api/public/ (built React SPA)
  Copy: node_modules (prod-only, re-installed)
  User: uid 1001 (non-root)
  EXPOSE 4000
  CMD ["node", "dist/app.js"]
```

Full annotated Dockerfile and Compose files are in `docs/design/deployment.md`.

---

### Local Development vs Production

| Aspect            | Local Dev (Compose)                  | Production Container            |
|-------------------|--------------------------------------|---------------------------------|
| Frontend          | Vite dev server (port 5173, HMR)     | Static files served by Express  |
| Backend           | nodemon (port 4000, hot reload)      | Compiled JS, `node dist/app.js` |
| CORS              | Required (`CORS_ORIGIN` env var)     | Not needed (same origin)        |
| Ports exposed     | 5173 (UI) + 4000 (API)               | 4000 only                       |
| Build step        | None — runs from source              | `vite build` + `tsc` in image   |

---

### Kubernetes Compatibility

The container is designed to run in a K8s pod without modification:

| K8s Requirement       | How it is met                                          |
|-----------------------|--------------------------------------------------------|
| Stateless             | No local disk writes; all state in PostgreSQL           |
| Config via env vars   | All config injected via env (12-factor)                |
| Liveness probe        | `GET /health` — fast, no DB call                       |
| Readiness probe       | `GET /ready` — verifies DB connectivity                |
| Graceful shutdown     | SIGTERM handler: drain requests, close DB pool          |
| Non-root user         | Runs as uid 1001                                       |
| Secrets management    | Env vars sourced from K8s Secrets (never in image)     |
| Resource limits       | Set in pod spec (`requests`/`limits` for CPU + memory) |

See `docs/design/deployment.md` for example K8s manifests.
