# MVP Implementation Design — my-finance

**Date:** 2026-06-06  
**Scope:** First working milestone — login, home page, credit cards, PAN registration  
**Status:** Approved

---

## Goals

Ship a running application where a user can:
1. Register and log in
2. Be prompted to register their PAN if they haven't
3. View their linked credit cards on the home/cards pages
4. Navigate between login → home → credit cards → PAN register

All other financial instruments (bank accounts, loans, investments, insurance) are deferred to future milestones.

---

## Monorepo Structure

```
my-finance/
├── apps/
│   ├── web/                  # React + Vite frontend
│   │   ├── src/
│   │   │   ├── components/   # Shared reusable components
│   │   │   ├── context/      # AuthContext
│   │   │   ├── hooks/        # Custom hooks (useAuth, useCards)
│   │   │   ├── pages/        # LoginPage, HomePage, CreditCardsPage, PanRegisterPage
│   │   │   ├── routes/       # ProtectedRoute, router config
│   │   │   ├── services/     # Axios HTTP client + API calls
│   │   │   ├── locales/      # i18n locale files
│   │   │   │   └── en/
│   │   │   │       ├── common.json
│   │   │   │       ├── auth.json
│   │   │   │       ├── cards.json
│   │   │   │       └── pan.json
│   │   │   ├── theme.ts      # MUI theme
│   │   │   ├── i18n.ts       # i18next singleton
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── vite.config.ts
│   │   └── package.json
│   └── api/
│       ├── src/
│       │   ├── routes/       # auth.routes.ts, pan.routes.ts, credit-cards.routes.ts
│       │   ├── controllers/  # auth.controller.ts, pan.controller.ts, credit-cards.controller.ts
│       │   ├── services/     # auth.service.ts, pan.service.ts, credit-cards.service.ts
│       │   ├── db/
│       │   │   ├── schema.ts         # Drizzle schema
│       │   │   ├── migrations/       # SQL migration files
│       │   │   ├── seed.ts           # Dev seed (devuser / devpass123)
│       │   │   └── index.ts          # Pool export
│       │   ├── middleware/
│       │   │   ├── auth.middleware.ts
│       │   │   ├── audit.middleware.ts
│       │   │   ├── validate.middleware.ts
│       │   │   └── rateLimit.middleware.ts
│       │   ├── utils/
│       │   │   ├── pan.utils.ts      # validate, HMAC, mask
│       │   │   └── token.utils.ts    # sign/verify JWT
│       │   ├── locales/
│       │   │   └── en.json           # All backend error messages in English
│       │   ├── app.ts                # createApp() factory
│       │   └── server.ts             # Entry point
│       └── package.json
├── docker-compose.yml
├── docker-compose.prod.yml
├── Dockerfile
├── package.json                      # Workspace root
└── README.md
```

---

## Backend Implementation

### Endpoints implemented in this milestone

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /health | No | Liveness probe |
| GET | /ready | No | Readiness probe |
| POST | /api/v1/auth/register | No | Create account |
| POST | /api/v1/auth/login | No | Login |
| POST | /api/v1/auth/refresh | No | Refresh access token |
| DELETE | /api/v1/auth/logout | Yes | Logout |
| GET | /api/v1/users/me | Yes | Get current user |
| POST | /api/v1/pan/register | Yes | Register PAN |
| GET | /api/v1/pan | Yes | Get PAN profile |
| GET | /api/v1/credit-cards | Yes | List credit cards |

### Middleware order (per architecture.md)

```
helmet → cors → json parser → localeMiddleware → rateLimiter → auth.middleware → audit.middleware → route handlers
```

### Database tables (in this milestone)

- `users` — accounts, passwords (bcrypt cost=12)
- `pan_profiles` — HMAC hash + masked display only, never full PAN
- `credit_cards` — card metadata, hash + last4 only
- `refresh_tokens` — token rotation, SHA-256 hash stored
- `audit_logs` — all actions auto-logged by audit.middleware

### PAN security

- Full PAN accepted at `POST /pan/register`, HMAC-SHA256 computed, raw PAN immediately discarded
- Masked form (`ABCDE####F`) stored in `pan_profiles.pan_masked`, derived server-side
- PAN never logged in any form
- Rate-limited: 3 registrations/day per user

### Auth tokens

- Access token: JWT 15min TTL, payload `{ userId, username, email, hasPan }`
- Refresh token: JWT 7d TTL, stored as SHA-256 hash in `refresh_tokens`, sent as HttpOnly SameSite=Strict cookie
- Token rotation: each refresh issues new token, revokes old
- Access token stored in memory only (never localStorage)

### i18n (backend)

- i18next + i18next-fs-backend
- Locale detected from `Accept-Language` header via `localeMiddleware`
- All `error.message` strings sourced from `apps/api/src/locales/en.json`
- English only for now

---

## Frontend Implementation

### Routes

| Route | Component | Auth | PAN required |
|-------|-----------|------|--------------|
| /login | LoginPage | No | No |
| / | HomePage | Yes | Yes → redirect /pan-register |
| /credit-cards | CreditCardsPage | Yes | Yes → redirect /pan-register |
| /pan-register | PanRegisterPage | Yes | No (registers PAN) |

### AuthContext

```ts
interface AuthUser {
  id: string;
  username: string;
  email: string;
  hasPan: boolean;
  panMasked: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setPan: (panMasked: string) => void;
  isLoading: boolean;
}
```

Access token stored in `useRef`, never in state or localStorage.

### ProtectedRoute behavior

1. `isLoading` true → full-page spinner (never flash content)
2. `user` null → redirect `/login?redirect=<current>`
3. `user.hasPan` false + financial route → redirect `/pan-register`
4. Otherwise → render children

### Silent refresh on mount

`AuthContext` calls `POST /api/v1/auth/refresh` on mount before rendering any routes. Sets `isLoading: false` on completion (success or 401).

### Axios interceptors

- Request interceptor: attaches `Authorization: Bearer <token>`
- Response interceptor: on 401, calls `/auth/refresh`, queues in-flight requests, retries or redirects to `/login`

### i18n (frontend)

- i18next + react-i18next + i18next-browser-languagedetector
- Set up once in `apps/web/src/i18n.ts`, imported in `main.tsx`
- All JSX strings via `t('key')` — no hardcoded text in JSX
- Namespaces: `common`, `auth`, `cards`, `pan`
- Locale files: `apps/web/src/locales/en/<namespace>.json`
- In tests: wrap with `<I18nextProvider i18n={i18n}>`

### MUI Theme

- Primary: `#1565C0` (finance-blue)
- Secondary: `#2E7D32` (money-green)
- Font: Inter / Roboto

---

## Pages detail

### LoginPage
- Fields: username, password
- React Hook Form + Zod validation
- On success: store token, navigate to `/` (or `?redirect` param)
- On error: display API error message via MUI Alert

### HomePage
- Shows greeting with username
- Summary cards: total credit limit, number of credit cards
- "View Credit Cards" button → `/credit-cards`
- If `hasPan` false → redirected to `/pan-register` by ProtectedRoute (never reached)

### CreditCardsPage
- List of credit cards from `GET /api/v1/credit-cards`
- Each card shows: issuing bank, last 4 digits, network, variant, status chip, credit limit, available credit, balance
- Loading state: MUI Skeleton
- Empty state: MUI Alert info — "No credit cards linked to this PAN yet"
- Error state: MUI Alert error

### PanRegisterPage
- Single field: PAN (10-char, uppercase transform, validated against `/^[A-Z]{5}[0-9]{4}[A-Z]$/`)
- React Hook Form + Zod
- On success: call `AuthContext.setPan(panMasked)`, navigate to `/`
- On error: show API error

---

## Testing

### Backend (Jest)

- Unit tests for: `pan.utils.ts`, `token.utils.ts`, `auth.service.ts`, `pan.service.ts`, `credit-cards.service.ts`
- Integration tests for all endpoints using `createApp()` factory with test DB
- Coverage threshold: 80% lines/branches/functions/statements

### Frontend (Vitest + RTL)

- Unit tests for: `AuthContext`, `ProtectedRoute`, all pages, all components
- Tests use `msw` for API mocking (no real HTTP calls)
- Wrap with `<I18nextProvider>` — never mock `useTranslation`
- Coverage threshold: 80%

---

## README developer section

- Prerequisites: Node.js 24+, Docker, Docker Compose
- First-time setup: `cp .env.example .env` + fill values
- Run dev: `docker compose up` (hot-reload Vite + nodemon + Postgres)
- Run tests: `npm test` (runs both web and api test suites)
- Build production image: `docker compose -f docker-compose.prod.yml up --build`
- Dev seed credentials: `devuser` / `devpass123`

---

## Out of scope (deferred)

- Bank accounts, loans, investments, insurance pages
- Financial overview/net worth summary
- User profile page
- Data export/erasure (DPDP)
- Multi-language locale files (infrastructure in place, English only)
- `/credit-cards/:cardId` detail page
