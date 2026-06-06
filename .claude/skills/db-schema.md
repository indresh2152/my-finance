---
name: db-schema
description: Show the database schema, tables, and how audit logging works
---

**Trigger:** User asks to "show the schema", "what tables exist", or "explain the data model".

Read `docs/design/database-schema.md` for the canonical schema.

For live inspection:
```bash
docker compose exec postgres psql -U myfinance -c "\dt"
```

**Key tables:** `users`, `pan_profiles`, `credit_cards`, `bank_accounts`, `loans`, `investments`, `insurance_policies`, `refresh_tokens`, `audit_logs`.

**Audit logging:**
`audit_logs.action` is a PostgreSQL enum (`audit_action`). Full set:
`USER_REGISTER`, `USER_LOGIN`, `USER_LOGIN_FAILED`, `USER_LOGOUT`, `USER_DELETE`,
`TOKEN_REFRESH`, `USER_PROFILE_VIEW`, `PAN_REGISTER`, `PAN_VIEW`, `OVERVIEW_VIEW`,
`CARD_LIST`, `CARD_VIEW`, `BANK_ACCOUNT_LIST`, `LOAN_LIST`, `INVESTMENT_LIST`,
`INSURANCE_LIST`, `AUDIT_LOG_VIEW`.

Audit logging is handled by `audit.middleware.ts` (not per-route calls). It registers a `res.on('finish')` handler, maps the matched Express route pattern to the enum value via `ROUTE_ACTION_MAP`, and skips `/health` and `/ready`. Adding a new audited route = one line in `ROUTE_ACTION_MAP`.
