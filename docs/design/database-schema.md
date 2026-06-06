# Database Schema — PostgreSQL 16

All tables use `UUID` primary keys (`gen_random_uuid()`). Timestamps are `TIMESTAMPTZ` stored in UTC. All monetary values are `NUMERIC(15,2)` in INR.

**PAN = Permanent Account Number** — 10-character alphanumeric ID issued by India's Income Tax Department (format: `AAAAA0000A`). Each user has exactly one PAN. All financial instruments link back to it.

---

## Entity Relationship Diagram

```
┌──────────────┐     1:1    ┌─────────────────────────────┐
│    users     │──────────►│       pan_profiles           │
│──────────────│            │─────────────────────────────│
│ id (PK)      │            │ id (PK)                      │
│ username     │            │ user_id (FK→users.id, UNIQUE)│
│ email        │            │ pan_hash   (HMAC-SHA256)     │
│ password_hash│            │ pan_masked (e.g. ABCDE####F) │
│ is_active    │            │ verified_at                  │
│ created_at   │            │ created_at                   │
│ updated_at   │            └──────────────┬───────────────┘
└──────────────┘                           │ 1:many to all instrument tables
          │                                │
          │            ┌───────────────────┼──────────────────────┐
          │            │                   │                      │
          │   ┌────────▼──────┐  ┌─────────▼──────┐  ┌──────────▼──────┐
          │   │ credit_cards  │  │ bank_accounts  │  │     loans       │
          │   │───────────────│  │────────────────│  │─────────────────│
          │   │ id (PK)       │  │ id (PK)        │  │ id (PK)         │
          │   │ pan_profile_id│  │ pan_profile_id │  │ pan_profile_id  │
          │   │ card_no_hash  │  │ acct_no_hash   │  │ loan_acct_hash  │
          │   │ card_no_last4 │  │ acct_no_last4  │  │ loan_acct_last4 │
          │   │ card_network  │  │ account_type   │  │ loan_type       │
          │   │ issuing_bank  │  │ bank_name      │  │ lender          │
          │   │ card_variant  │  │ ifsc_prefix    │  │ principal_amount │
          │   │ expiry_month  │  │ balance        │  │ outstanding_amt  │
          │   │ expiry_year   │  │ status         │  │ emi_amount      │
          │   │ name_on_card  │  │ ...            │  │ interest_rate   │
          │   │ status        │  └────────────────┘  │ ...             │
          │   │ credit_limit  │                       └─────────────────┘
          │   │ available_cr  │
          │   │ balance       │  ┌──────────────────┐  ┌──────────────────┐
          │   │ billing_day   │  │   investments    │  │insurance_policies│
          │   └───────────────┘  │──────────────────│  │──────────────────│
          │                      │ id (PK)          │  │ id (PK)          │
          │                      │ pan_profile_id   │  │ pan_profile_id   │
          │                      │ investment_type  │  │ policy_type      │
          │                      │ institution_name │  │ insurer          │
          │                      │ scheme_name      │  │ policy_no_hash   │
          │                      │ folio_display    │  │ policy_number_masked │
          │                      │ current_value    │  │ sum_assured      │
          │                      │ invested_amount  │  │ premium_amount   │
          │                      │ ...              │  │ next_due_date    │
          │                      └──────────────────┘  │ ...              │
          │                                            └──────────────────┘
          │
    ┌─────▼──────────────┐     ┌───────────────────────┐
    │  refresh_tokens    │     │      audit_logs        │
    │────────────────────│     │───────────────────────│
    │ id (PK)            │     │ id (PK)               │
    │ user_id (FK)       │     │ user_id (FK, nullable)│
    │ token_hash         │     │ action                │
    │ expires_at         │     │ resource_type         │
    │ revoked_at         │     │ resource_id           │
    │ user_agent         │     │ ip_address            │
    │ ip_address         │     │ metadata (JSONB)      │
    │ created_at         │     │ created_at            │
    └────────────────────┘     └───────────────────────┘
```

---

## DDL

### `users`

```sql
CREATE TABLE users (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  username         VARCHAR(50)  NOT NULL UNIQUE,
  email            VARCHAR(255) NOT NULL UNIQUE,
  password_hash    TEXT         NOT NULL,              -- bcrypt, cost=12
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  -- DPDP Act 2023: explicit consent tracking required before collecting financial data
  consent_given_at TIMESTAMPTZ,                        -- NULL = consent not yet given
  consent_version  VARCHAR(20),                        -- e.g. 'v1.2' — version of privacy policy accepted
  -- DPDP right-to-erasure: soft-delete preserves audit log FK references
  deleted_at       TIMESTAMPTZ,                        -- NULL = active account
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email    ON users (email);
CREATE INDEX idx_users_username ON users (username);
```

---

### `pan_profiles`

One row per user. Stores the user's Permanent Account Number in hashed form only.

```sql
CREATE TABLE pan_profiles (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  pan_hash    TEXT        NOT NULL UNIQUE,   -- HMAC-SHA256(PAN, PAN_HMAC_SECRET)
  pan_masked  CHAR(10)    NOT NULL,          -- display only, e.g. 'ABCDE####F'
  verified_at TIMESTAMPTZ,                   -- NULL = pending verification
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pan_profiles_pan_hash ON pan_profiles (pan_hash);
```

**Notes:**
- Full PAN (`ABCDE1234F`) is **never stored**. `pan_hash` is an HMAC-SHA256 using a server-side secret from env, making offline dictionary attacks infeasible.
- `pan_masked` is computed client-side before submission: replace positions 6–9 (the 4 digits) with `#`. Example: `ABCDE1234F` → `ABCDE####F`.
- `verified_at` can be set when PAN is confirmed via an OTP or third-party verification service.
- Each user has at most **one** PAN profile (UNIQUE constraint on `user_id`).

---

### `credit_cards`

All credit cards linked to a PAN.

```sql
CREATE TYPE card_status  AS ENUM ('ACTIVE', 'BLOCKED', 'EXPIRED', 'CLOSED');
CREATE TYPE card_network AS ENUM ('VISA', 'MASTERCARD', 'AMEX', 'RUPAY', 'DINERS', 'OTHER');
CREATE TYPE card_variant AS ENUM ('CLASSIC', 'GOLD', 'PLATINUM', 'INFINITE', 'SIGNATURE', 'OTHER');

CREATE TABLE credit_cards (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  pan_profile_id   UUID         NOT NULL REFERENCES pan_profiles(id) ON DELETE CASCADE,
  card_number_hash TEXT         NOT NULL UNIQUE,  -- HMAC of full 16-digit card number
  card_number_last4 CHAR(4)     NOT NULL,
  card_network     card_network NOT NULL,
  issuing_bank     VARCHAR(100) NOT NULL,
  card_variant     card_variant NOT NULL DEFAULT 'CLASSIC',
  expiry_month     SMALLINT     NOT NULL CHECK (expiry_month BETWEEN 1 AND 12),
  expiry_year      SMALLINT     NOT NULL CHECK (expiry_year >= 2020),
  name_on_card     VARCHAR(100) NOT NULL,
  status           card_status  NOT NULL DEFAULT 'ACTIVE',
  credit_limit     NUMERIC(15,2),
  available_credit NUMERIC(15,2),
  current_balance  NUMERIC(15,2),
  billing_cycle_day SMALLINT    CHECK (billing_cycle_day BETWEEN 1 AND 31),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_credit_cards_pan_profile_id ON credit_cards (pan_profile_id);
CREATE INDEX idx_credit_cards_status         ON credit_cards (status);
```

---

### `bank_accounts`

Savings, current, NRE/NRO, and fixed/recurring deposit accounts.

```sql
CREATE TYPE bank_account_type   AS ENUM ('SAVINGS', 'CURRENT', 'FD', 'RD', 'NRE', 'NRO', 'OTHER');
CREATE TYPE bank_account_status AS ENUM ('ACTIVE', 'DORMANT', 'CLOSED', 'FROZEN');

CREATE TABLE bank_accounts (
  id                  UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  pan_profile_id      UUID               NOT NULL REFERENCES pan_profiles(id) ON DELETE CASCADE,
  account_number_hash TEXT               NOT NULL UNIQUE,  -- HMAC of full account number
  account_number_last4 CHAR(4)           NOT NULL,
  account_type        bank_account_type  NOT NULL DEFAULT 'SAVINGS',
  bank_name           VARCHAR(100)       NOT NULL,
  branch_name         VARCHAR(100),
  ifsc_prefix         CHAR(4),           -- first 4 chars of IFSC, e.g. 'HDFC'
  balance             NUMERIC(15,2),
  interest_rate       NUMERIC(5,2),      -- for FD/RD, annual rate e.g. 7.25
  maturity_date       DATE,              -- for FD/RD
  status              bank_account_status NOT NULL DEFAULT 'ACTIVE',
  created_at          TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bank_accounts_pan_profile_id ON bank_accounts (pan_profile_id);
```

---

### `loans`

All loan accounts linked to a PAN (home, personal, auto, education, gold, business).

```sql
CREATE TYPE loan_type   AS ENUM ('HOME', 'PERSONAL', 'AUTO', 'EDUCATION', 'GOLD', 'BUSINESS', 'LAP', 'OTHER');
CREATE TYPE loan_status AS ENUM ('ACTIVE', 'CLOSED', 'NPA', 'SETTLED', 'WRITTEN_OFF');

CREATE TABLE loans (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pan_profile_id      UUID        NOT NULL REFERENCES pan_profiles(id) ON DELETE CASCADE,
  loan_account_hash   TEXT        NOT NULL UNIQUE,  -- HMAC of full loan account number
  loan_account_last4  CHAR(4)     NOT NULL,
  loan_type           loan_type   NOT NULL,
  lender              VARCHAR(100) NOT NULL,
  principal_amount    NUMERIC(15,2) NOT NULL,
  outstanding_amount  NUMERIC(15,2),
  emi_amount          NUMERIC(15,2),
  emi_due_day         SMALLINT    CHECK (emi_due_day BETWEEN 1 AND 31),
  interest_rate       NUMERIC(5,2) NOT NULL,        -- annual rate e.g. 9.50
  tenure_months       INTEGER,
  disbursement_date   DATE,
  maturity_date       DATE,
  status              loan_status NOT NULL DEFAULT 'ACTIVE',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_loans_pan_profile_id ON loans (pan_profile_id);
CREATE INDEX idx_loans_status         ON loans (status);
```

---

### `investments`

Mutual funds, direct equity/demat, PPF, NPS, bonds, and other investment instruments.

```sql
CREATE TYPE investment_type AS ENUM (
  'MUTUAL_FUND', 'STOCKS', 'PPF', 'NPS', 'BONDS',
  'GOVT_SECURITIES', 'GOLD', 'REAL_ESTATE', 'OTHER'
);

CREATE TABLE investments (
  id                UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  pan_profile_id    UUID            NOT NULL REFERENCES pan_profiles(id) ON DELETE CASCADE,
  investment_type   investment_type NOT NULL,
  institution_name  VARCHAR(100)    NOT NULL,       -- AMC name, broker, bank, etc.
  scheme_name       VARCHAR(255),                   -- fund/scheme name
  folio_display     VARCHAR(50),                    -- non-sensitive folio/account display
  units_or_quantity NUMERIC(18,4),                  -- units for MF, shares for stocks
  purchase_nav      NUMERIC(10,4),                  -- for MF: NAV at purchase
  current_value     NUMERIC(15,2),
  invested_amount   NUMERIC(15,2),
  as_of_date        DATE,                           -- date current_value was last fetched
  created_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_investments_pan_profile_id ON investments (pan_profile_id);
CREATE INDEX idx_investments_type           ON investments (investment_type);
```

**Notes:**
- Folio numbers and demat account numbers are not especially sensitive but are masked to just a display-friendly label in `folio_display`.
- `current_value` and `as_of_date` are updated periodically; they are point-in-time snapshots.

---

### `insurance_policies`

Life, health, vehicle, home, and travel insurance policies.

```sql
CREATE TYPE insurance_type   AS ENUM ('LIFE', 'HEALTH', 'VEHICLE', 'HOME', 'TRAVEL', 'OTHER');
CREATE TYPE premium_frequency AS ENUM ('MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'SINGLE');
CREATE TYPE policy_status    AS ENUM ('ACTIVE', 'LAPSED', 'EXPIRED', 'SURRENDERED', 'CLAIMED');

CREATE TABLE insurance_policies (
  id                  UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  pan_profile_id      UUID              NOT NULL REFERENCES pan_profiles(id) ON DELETE CASCADE,
  policy_number_hash  TEXT              NOT NULL UNIQUE,  -- HMAC of policy number
  policy_number_masked VARCHAR(20)      NOT NULL,         -- e.g. 'POL****9012'
  policy_type         insurance_type    NOT NULL,
  insurer             VARCHAR(100)      NOT NULL,
  plan_name           VARCHAR(255),
  sum_assured         NUMERIC(15,2),
  premium_amount      NUMERIC(15,2),
  premium_frequency   premium_frequency NOT NULL DEFAULT 'YEARLY',
  next_due_date       DATE,
  maturity_date       DATE,
  status              policy_status     NOT NULL DEFAULT 'ACTIVE',
  created_at          TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_insurance_policies_pan_profile_id ON insurance_policies (pan_profile_id);
CREATE INDEX idx_insurance_policies_next_due_date  ON insurance_policies (next_due_date);
```

---

### `refresh_tokens`

```sql
CREATE TABLE refresh_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT        NOT NULL UNIQUE,  -- SHA-256 of the raw refresh JWT
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  user_agent TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user_id    ON refresh_tokens (user_id);
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens (expires_at);
```

---

### `audit_logs`

`action` is a PostgreSQL enum, not a free-form string, so the set of auditable events is enforced at the database level.

```sql
CREATE TYPE audit_action AS ENUM (
  -- Auth
  'USER_REGISTER',      -- POST /auth/register
  'USER_LOGIN',         -- POST /auth/login (success)
  'USER_LOGIN_FAILED',  -- POST /auth/login (401) — user_id may be NULL
  'USER_LOGOUT',        -- POST /auth/logout
  'USER_DELETE',        -- DELETE /users/me (DPDP right-to-erasure)
  'TOKEN_REFRESH',      -- POST /auth/refresh
  -- User profile
  'USER_PROFILE_VIEW',    -- GET /users/me
  'USER_PROFILE_UPDATE',  -- PATCH /users/me (password/email change)
  'DATA_EXPORT_REQUEST',  -- GET /users/me/data-export (DPDP right-to-access)
  -- PAN
  'PAN_REGISTER',       -- POST /pan/register
  'PAN_VIEW',           -- GET /pan
  -- Financial data reads (PCI DSS Req 10: log every view)
  'OVERVIEW_VIEW',      -- GET /overview
  'CARD_LIST',          -- GET /credit-cards
  'CARD_VIEW',          -- GET /credit-cards/:cardId
  'BANK_ACCOUNT_LIST',  -- GET /bank-accounts
  'LOAN_LIST',          -- GET /loans
  'INVESTMENT_LIST',    -- GET /investments
  'INSURANCE_LIST',     -- GET /insurance
  -- Audit
  'AUDIT_LOG_VIEW'      -- GET /audit-logs (self-service)
);

CREATE TABLE audit_logs (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID         REFERENCES users(id) ON DELETE SET NULL,
  action        audit_action NOT NULL,
  resource_type VARCHAR(50),             -- e.g. 'credit_card', 'loan', 'pan_profile'
  resource_id   UUID,
  ip_address    INET,
  metadata      JSONB,                   -- never put PAN, account numbers, or policy numbers here
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id    ON audit_logs (user_id);
CREATE INDEX idx_audit_logs_action     ON audit_logs (action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at DESC);
```

---

### `data_requests`

Tracks DPDP right-to-access (data export) and right-to-erasure (account deletion) requests.

```sql
CREATE TYPE data_request_type   AS ENUM ('EXPORT', 'ERASURE');
CREATE TYPE data_request_status AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

CREATE TABLE data_requests (
  id           UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID               NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  request_type data_request_type  NOT NULL,
  status       data_request_status NOT NULL DEFAULT 'PENDING',
  requested_at TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_data_requests_user_id ON data_requests (user_id);
```

**Notes:**
- `EXPORT` requests are fulfilled asynchronously; a download link or email is sent once data is packaged.
- `ERASURE` requests trigger cascade deletion of all PII and financial data; `users.deleted_at` is set first (soft-delete) to preserve audit log FK references, then a background job completes the hard delete after 30 days.
- Row survives user deletion (`ON DELETE SET NULL`) so the request log is maintained for compliance audits.

---

**Write mechanism — Express middleware**

All audit writes happen in a single Express middleware (`audit.middleware.ts`) registered after the auth middleware. Route handlers never call `auditLog()` directly — the middleware handles every `/api/v1/*` request automatically. `/health` and `/ready` are excluded.

The middleware listens on `res.on('finish', ...)` so it has access to the final HTTP status code, then looks up the `audit_action` for the matched Express route pattern.

```typescript
// apps/api/src/middleware/audit.middleware.ts

const SKIP_PATHS = new Set(['/health', '/ready']);

// Maps "METHOD /api/v1/route-pattern" → audit_action
const ROUTE_ACTION_MAP: Record<string, AuditAction> = {
  'POST /api/v1/auth/register':         AuditAction.USER_REGISTER,
  'POST /api/v1/auth/login':            AuditAction.USER_LOGIN,      // overridden to USER_LOGIN_FAILED on 401
  'POST /api/v1/auth/logout':           AuditAction.USER_LOGOUT,
  'POST /api/v1/auth/refresh':          AuditAction.TOKEN_REFRESH,
  'DELETE /api/v1/users/me':            AuditAction.USER_DELETE,
  'GET /api/v1/users/me':               AuditAction.USER_PROFILE_VIEW,
  'PATCH /api/v1/users/me':             AuditAction.USER_PROFILE_UPDATE,
  'GET /api/v1/users/me/data-export':   AuditAction.DATA_EXPORT_REQUEST,
  'POST /api/v1/pan/register':          AuditAction.PAN_REGISTER,
  'GET /api/v1/pan':                    AuditAction.PAN_VIEW,
  'GET /api/v1/overview':               AuditAction.OVERVIEW_VIEW,
  'GET /api/v1/credit-cards':           AuditAction.CARD_LIST,
  'GET /api/v1/credit-cards/:cardId':   AuditAction.CARD_VIEW,
  'GET /api/v1/bank-accounts':          AuditAction.BANK_ACCOUNT_LIST,
  'GET /api/v1/loans':                  AuditAction.LOAN_LIST,
  'GET /api/v1/investments':            AuditAction.INVESTMENT_LIST,
  'GET /api/v1/insurance':              AuditAction.INSURANCE_LIST,
  'GET /api/v1/audit-logs':             AuditAction.AUDIT_LOG_VIEW,
};

export function auditMiddleware(db: Pool): RequestHandler {
  return (req, res, next) => {
    if (SKIP_PATHS.has(req.path)) return next();

    const startMs = Date.now();

    res.on('finish', async () => {
      // req.route.path is the Express route pattern (e.g. '/credit-cards/:cardId')
      // populated by the time 'finish' fires.
      const routeKey = `${req.method} /api/v1${req.route?.path ?? ''}`;
      let action = ROUTE_ACTION_MAP[routeKey];
      if (!action) return;   // unknown route — skip silently

      // Failed login gets its own action so it can be queried separately.
      if (routeKey === 'POST /api/v1/auth/login' && res.statusCode === 401) {
        action = AuditAction.USER_LOGIN_FAILED;
      }

      try {
        await db.query(
          `INSERT INTO audit_logs
             (user_id, action, resource_type, resource_id, ip_address, metadata)
           VALUES ($1, $2, $3, $4, $5::inet, $6)`,
          [
            req.user?.id ?? null,
            action,
            resourceTypeFor(routeKey),
            req.params.cardId ?? req.params.id ?? null,
            req.ip,
            JSON.stringify({ statusCode: res.statusCode, durationMs: Date.now() - startMs }),
          ]
        );
      } catch (err) {
        // Audit failure must never break the request.
        // Write to stderr for SIEM pickup; do not rethrow.
        console.error('[audit] write failed:', err);
      }
    });

    next();
  };
}
```

`resourceTypeFor()` is a small pure function that maps a route key to the `resource_type` string (e.g. `'credit_card'`, `'loan'`) — defined alongside the map above.

**Middleware registration order in `app.ts`**

```
helmet / cors / json parser
    ↓
rate limiters  (per-route where applicable)
    ↓
auth.middleware      ← populates req.user
    ↓
audit.middleware     ← reads req.user; writes on res finish
    ↓
route handlers
```

**Retention**

| Requirement | Rule |
|---|---|
| CERT-In 2022 | Logs must be kept for **at least 180 days** in India |
| Operational | Rows older than **2 years** may be archived or deleted |

Enforce with a nightly pg_cron job (if the managed Postgres instance supports it):

```sql
-- Run once at 02:00 IST (20:30 UTC) every night
SELECT cron.schedule('purge-old-audit-logs', '30 20 * * *', $$
  DELETE FROM audit_logs
  WHERE created_at < NOW() - INTERVAL '2 years';
$$);
```

If pg_cron is unavailable, the same DELETE runs from a `node-cron` job inside the Express server:

```typescript
// apps/api/src/jobs/purgeAuditLogs.ts
import cron from 'node-cron';
cron.schedule('30 20 * * *', async () => {
  await db.query(`DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '2 years'`);
});
```

**Notes:**
- Append-only. No UPDATEs or DELETEs within the retention window.
- `user_id` is `SET NULL` on user deletion so logs survive the right-to-erasure flow (raw PAN/account data is never in the log anyway).
- `metadata` JSONB must never contain PAN, full account numbers, or policy numbers.

---

## Migrations Strategy

- One file per migration: `YYYYMMDDHHMMSS_description.sql`
- Applied in sequence; tracked in `schema_migrations` table (managed by Drizzle Kit).
- No destructive DDL in migrations without a rollback file.

### Auto-migration on startup

Migrations run automatically when the Express server starts, before `app.listen`. This means the container is always in sync with its expected schema — no manual pre-flight step in the deploy pipeline.

```typescript
// apps/api/src/index.ts
async function start() {
  await runMigrations();   // apply any pending migrations; throws on failure
  await seedDevData();     // no-op in production; creates dev user in development
  const server = app.listen(PORT, () =>
    console.log(`[server] listening on :${PORT}`)
  );
  // graceful shutdown wired here (see deployment.md)
}
start().catch((err) => { console.error(err); process.exit(1); });
```

If `runMigrations()` throws (e.g. DB unreachable), the process exits with code 1 and the container restarts per Docker/K8s restart policy. `GET /ready` will return 503 until the next successful start.

### Dev seed

`seedDevData()` is guarded by `NODE_ENV !== 'production'`. It creates one user if the `users` table is empty, so developers can immediately hit the API without a manual setup step:

| Field    | Value             |
|----------|-------------------|
| username | `devuser`         |
| email    | `dev@example.com` |
| password | `devpass123`      |

The seed is idempotent — it uses `INSERT ... ON CONFLICT DO NOTHING`.

---

## Sensitive Data Summary

| Field                   | Stored as               | Display                            |
|-------------------------|-------------------------|------------------------------------|
| Full PAN                | HMAC-SHA256 hash        | Never — masked form only (`ABCDE####F`) |
| Card number             | HMAC-SHA256 hash        | Last 4 digits only                 |
| Bank account number     | HMAC-SHA256 hash        | Last 4 digits only                 |
| Loan account number     | HMAC-SHA256 hash        | Last 4 digits only                 |
| Insurance policy number | HMAC-SHA256 hash        | Masked display only (`POL****9012`) |
| Password                | bcrypt (cost=12)        | Never                              |
| Refresh token           | SHA-256 hash            | Never                              |
| Financial balances      | Plaintext `NUMERIC`     | Only to authenticated owner        |
