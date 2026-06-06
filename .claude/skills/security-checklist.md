---
name: security-checklist
description: Pre-PR security checklist for auth, PAN handling, DB queries, and Dockerfile changes
---

**Trigger:** Before any PR that touches auth, PAN handling, database queries, or the Dockerfile.

- [ ] PAN (Permanent Account Number) never stored in plaintext — only HMAC hash + masked string
- [ ] PAN masked display format is `ABCDE####F` (hide the 4 numeric digits)
- [ ] PAN format validated with `/^[A-Z]{5}[0-9]{4}[A-Z]$/` before any DB operation
- [ ] PAN never logged in any form (not even masked)
- [ ] Account numbers (bank, loan, policy) are hashed; only last 4 digits stored for display
- [ ] All DB queries use parameterized statements (no string interpolation)
- [ ] JWT expiry is set and refresh logic is correct
- [ ] CORS: disabled in production (same-origin); enabled only when `CORS_ORIGIN` env var is present
- [ ] Rate limiting on: login (5/min/IP), PAN registration (3/day/user), registration (10/hr/IP)
- [ ] Input validation rejects malformed PAN before any DB hit
- [ ] Financial amounts formatted in Indian number system (`en-IN` locale) on the frontend
- [ ] Dockerfile runner stage uses non-root user (uid 1001)
- [ ] Secrets passed as env vars or K8s Secrets — never baked into the image or committed to git
- [ ] `GET /health` returns 200 quickly; `GET /ready` checks DB connectivity
- [ ] Graceful shutdown: handle SIGTERM — drain in-flight requests, close DB pool before exit
- [ ] SPA catch-all: Express serves `index.html` for all non-`/api/` GET routes
- [ ] PostgreSQL is deployed in an India-region only (RBI data localisation)
- [ ] `audit_logs` retention is at least 180 days in India (CERT-In)
- [ ] Every `CARD_VIEW` action is recorded in `audit_logs` (PCI DSS Req 10)
- [ ] User consent is recorded (`consent_given_at`, `consent_version`) before collecting financial data (DPDP)
- [ ] Right-to-erasure endpoint (`DELETE /users/me`) is implemented (DPDP)
- [ ] No folio numbers, demat account IDs, or policy numbers exposed in raw form (SEBI/IRDAI)
- [ ] Global error middleware is registered last in `app.ts` (after all routes)
- [ ] No route handler catches errors inline — all errors passed to `next(err)`
- [ ] No stack trace in any HTTP response body — in any environment
- [ ] Unknown/unhandled errors return `{ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } }` — never `err.message`
- [ ] Unhandled errors are logged with `requestId` for correlation
- [ ] `npm audit --audit-level=high` passes with no high/critical vulnerabilities (pre-commit)
- [ ] `npm audit --audit-level=moderate` passes in CI for both `apps/web` and `apps/api`
- [ ] CI uses `npm ci` (not `npm install`) to enforce lock file
- [ ] `eslint-plugin-security` rules pass — no `eval()`, `new Function()`, or `exec()` with user-controlled input
