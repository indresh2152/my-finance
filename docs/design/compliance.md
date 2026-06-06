# Compliance & Regulatory Requirements

`my-finance` handles credit card metadata, bank account data, investment records, insurance policies, and India's Permanent Account Number (PAN). This places it under multiple overlapping compliance frameworks. This document describes each one, what it demands from the application, and how the design addresses it.

> This document is a design-phase guide, not a legal opinion. Engage a qualified compliance auditor before going live with real user data.

---

## Summary Table

| Framework                         | Applicability       | Enforcement                         | Priority  |
|-----------------------------------|---------------------|-------------------------------------|-----------|
| PCI DSS v4.0                      | Credit card data    | Card network fines; mandatory audit | Critical  |
| RBI Digital Payment Security Controls (2021) | India payment apps | RBI directive; licence risk | Critical  |
| RBI Data Localisation (2018)      | Payment system data | RBI directive                       | Critical  |
| DPDP Act 2023                     | All personal data   | India law; up to ₹250 Cr penalty    | Critical  |
| CERT-In Directions (2022)         | All IT systems      | India law; mandatory reporting      | Critical  |
| SOC 2 Type II                     | SaaS / cloud        | Customer-driven audit               | High      |
| ISO 27001                         | InfoSec management  | Certification                       | High      |
| SEBI KYC / LODR Guidelines        | Investment data     | SEBI directive                      | Medium    |
| IRDAI Data Guidelines             | Insurance data      | IRDAI directive                     | Medium    |
| OWASP ASVS Level 2                | Application security| Industry best practice              | High      |

---

## 1. PCI DSS v4.0 — Payment Card Industry Data Security Standard

### Why it applies
The app displays credit card metadata: card network, issuing bank, last 4 digits of card number, expiry date, and outstanding balance. Storing any of these fields in association with a cardholder — even masked — means the system is part of the **Cardholder Data Environment (CDE)**.

### Scope reduction strategy
Full card numbers are never stored (only HMAC hash + last 4 digits). This significantly narrows scope, but does **not** eliminate it. The applicable SAQ level depends on the final data flow.

### Key requirements and how this design addresses them

| PCI DSS Requirement | Design Control |
|---------------------|----------------|
| Req 3 — Protect stored cardholder data | Card numbers stored as HMAC-SHA256 only; last 4 digits for display |
| Req 4 — Encrypt transmission | TLS 1.2+ enforced at all ingress points (container → load balancer → client) |
| Req 6 — Develop secure systems | OWASP ASVS checklist; dependency scanning (npm audit); SAST in CI |
| Req 7 — Restrict access by need-to-know | API returns card data only to authenticated owner; no admin bulk-export endpoints |
| Req 8 — Identify and authenticate | JWT with short TTL (15 min); refresh token rotation; no shared credentials |
| Req 10 — Audit all access to cardholder data | `audit_logs` table records every `CARD_VIEW` action with user, IP, and timestamp |
| Req 11 — Test security systems | Penetration testing before launch; recurring DAST scans |
| Req 12 — Security policies | Document incident response plan; define data retention and deletion schedules |

### Outstanding gaps to address before launch
- Formal SAQ self-assessment questionnaire (SAQ-A-EP or SAQ-D depending on architecture)
- Qualified Security Assessor (QSA) review if processing >6 million transactions/year
- Network segmentation diagram showing CDE boundary
- Quarterly vulnerability scans by an Approved Scanning Vendor (ASV)

---

## 2. RBI Master Direction on Digital Payment Security Controls (2021)

### Why it applies
Any mobile/web application in India that displays, processes, or stores payment-related data (cards, UPI, net banking) must comply with RBI's Digital Payment Security Controls.

### Key requirements

| RBI Requirement | Design Control |
|-----------------|----------------|
| Secure coding and VAPT | SAST in CI pipeline; annual VAPT by CERT-In empanelled auditor |
| Multi-factor authentication for sensitive operations | Password + OTP flow for PAN registration; consider TOTP 2FA for login |
| Session management | JWT access token: 15-min TTL; HttpOnly refresh cookie; forced logout on inactivity |
| Data encryption at rest and in transit | PostgreSQL encryption at rest (volume-level); TLS in transit |
| Fraud risk management | Rate limiting on all auth and card lookup endpoints; anomaly detection logging |
| Incident response | CERT-In report within 6 hours (see Section 5); maintain 180-day logs |
| Third-party risk | Vendor assessment for any future data aggregation partners (AA framework) |

---

## 3. RBI Data Localisation (2018)

### Why it applies
RBI's 2018 circular mandates that **all data related to payment systems operated in India must be stored only in India**. This applies to card data, PAN data used in financial contexts, and transaction data.

### What this means for deployment

- **PostgreSQL must run on India-region cloud infrastructure** (e.g., AWS ap-south-1 Mumbai, GCP asia-south1 Mumbai, Azure Central India).
- Docker containers (app + DB) must be deployed to India-region data centres only.
- No payment-related data may be replicated to servers outside India, including backup or DR regions (cross-region backup must stay within India).
- Log aggregation tools (if used) must store logs in India.

### Design notes
- When deploying to K8s, the cluster must be in an India-region.
- The `DATABASE_URL` must point to an India-region managed PostgreSQL service (e.g., AWS RDS in ap-south-1).
- If a CDN is used for static assets, ensure no user-identifiable data is cached outside India.

---

## 4. DPDP Act 2023 — Digital Personal Data Protection Act

### Why it applies
India's data privacy law (effective 2023) governs collection and processing of personal data of Indian residents. PAN is personal data. Financial instrument details (card numbers, bank balances, loan amounts) are **sensitive personal data**.

### Key principles and how the design addresses them

| DPDP Principle | Requirement | Design Control |
|----------------|-------------|----------------|
| Lawful purpose | Collect only data needed for the stated purpose | Data minimisation: store only last 4 digits and hashes; no full PAN or card numbers |
| Consent | Explicit, informed, granular consent before collecting personal/sensitive data | Consent screen during onboarding; separate consent for each financial data category |
| Data minimisation | Do not collect more than necessary | Only metadata stored per financial instrument; no transaction history initially |
| Accuracy | Keep personal data accurate | `updated_at` timestamps; prompt user to refresh stale data |
| Storage limitation | Delete data when purpose is served | Define and implement data retention policy (e.g., delete inactive accounts after 2 years) |
| Right to access | User can request all their data | `GET /users/me/data-export` endpoint to add |
| Right to erasure | User can request deletion | `DELETE /users/me` must cascade-delete all PII and financial data |
| Data breach notification | Notify Data Protection Board within 72 hours | Incident response runbook; integrate with CERT-In reporting |
| Data Fiduciary obligations | Appoint a Data Protection Officer (DPO) if above thresholds | Assess threshold when user base grows |
| Penalty | Up to ₹250 crore per breach | High — treat this as a critical requirement |

### Additions needed to the data model

| Addition | Purpose |
|---|---|
| `users.consent_given_at` | Timestamp when user accepted privacy policy |
| `users.consent_version` | Which version of the privacy policy was accepted |
| `users.deleted_at` (soft delete) | Support right-to-erasure without immediately breaking audit logs |
| `data_export_requests` table | Track export and erasure requests with status and completion timestamp |

---

## 5. CERT-In Directions (2022)

### Why it applies
India's Computer Emergency Response Team (CERT-In) issued mandatory directions in April 2022 that apply to **all IT intermediaries, data centres, and body corporates** operating in India.

### Key requirements

| Requirement | Detail |
|---|---|
| Incident reporting | Report cybersecurity incidents to CERT-In within **6 hours** of detection |
| Log retention | Maintain ICT system logs for **180 days** within India |
| Accurate system clocks | All servers must sync to NTP servers of NIC (National Informatics Centre) or NPCI |
| KYC for users | Maintain accurate user records; verify identity on registration |
| VPN/cloud logs | If using VPN or cloud, maintain logs of all access |

### Design implications
- `audit_logs` table must retain records for at least 180 days. Add a scheduled job to archive (not delete) logs older than 180 days to cold storage within India.
- Application servers must use NTP sync (`pool.ntp.org` or NIC servers).
- Define and document an incident response runbook with a 6-hour reporting SLA.

---

## 6. SOC 2 Type II

### Why it applies
SOC 2 is a voluntary audit framework but is increasingly required by enterprise clients, banks, and partners in India's fintech ecosystem. Demonstrates that the application's security controls are operating effectively over time (typically a 6–12 month observation period).

### Trust Service Criteria (TSC) relevant to this app

| TSC | Key Controls |
|-----|--------------|
| Security (CC) | Access control, MFA, pen testing, vulnerability management, SIEM |
| Availability (A) | Uptime SLA, health/ready probes, K8s pod restart policies, DB backups |
| Confidentiality (C) | Encryption at rest and in transit, PAN/card data hashing, RBAC |
| Privacy (P) | DPDP consent flows, data minimisation, right-to-erasure, retention policy |

### What to implement before pursuing SOC 2
- Formalise security policies (access control, incident response, change management)
- Enable audit logging for all admin and data access events
- Implement automated dependency vulnerability scanning (e.g., `npm audit`, Snyk)
- Set up SIEM or log aggregation with alerting (e.g., CloudWatch, Datadog, or self-hosted)
- Conduct a penetration test and remediate findings
- Define and test a disaster recovery (DR) and backup restoration process

---

## 7. ISO 27001

### Why it applies
ISO 27001 is the international standard for Information Security Management Systems (ISMS). It is a prerequisite for many enterprise partnerships and provides the governance structure that underpins SOC 2 and PCI DSS.

### Key Annex A controls relevant to this app

| Control Area | Relevance |
|---|---|
| A.8 — Asset management | Classify data (public / internal / confidential / restricted); label PAN and card data as restricted |
| A.9 — Access control | RBAC; principle of least privilege; privileged access review |
| A.10 — Cryptography | Document key management for `PAN_HMAC_SECRET` and JWT secrets; rotation schedule |
| A.12 — Operations security | Patch management; malware protection; log monitoring |
| A.13 — Communications security | TLS policy; network segmentation for DB |
| A.14 — System acquisition | Secure SDLC; SAST/DAST in CI/CD; peer code review required for auth and data handling changes |
| A.16 — Incident management | Incident classification; escalation path; CERT-In 6-hour reporting |
| A.17 — Business continuity | DB backup policy; RTO/RPO targets; DR runbook |
| A.18 — Compliance | DPDP, PCI DSS, RBI — map controls to each standard |

---

## 8. SEBI KYC / LODR Guidelines

### Why it applies
When the app displays investment data (mutual funds, stocks, demat accounts), SEBI's data handling requirements apply. SEBI mandates that investor data processed by intermediaries is kept confidential and not misused.

### Key requirements
- Investment data (portfolio, NAV, folio numbers) may only be displayed to the verified account holder.
- Folio and demat account numbers must be masked in display (current design: `folio_display` field).
- Do not expose raw ISIN, client codes, or DP account numbers in API responses.
- If integrating with CAMS/KFintech (MF data sources), ensure data sharing agreements comply with SEBI data sharing guidelines.

---

## 9. IRDAI Data Guidelines

### Why it applies
Insurance policy data (sum assured, premium, beneficiaries) is sensitive. IRDAI has issued guidelines on data privacy for insurers and intermediaries.

### Key requirements
- Policy numbers must be masked in display (current design: `policy_number_masked` field).
- Insurance data may only be shown to the verified policyholder.
- Do not store beneficiary names or nominee details without explicit consent.
- If integrating with insurer APIs, comply with IRDAI data sharing consent norms.

---

## 10. OWASP ASVS Level 2

### Why it applies
OWASP Application Security Verification Standard Level 2 is the baseline for applications handling sensitive financial data. It provides a verifiable checklist of application security controls.

### Key ASVS categories and current design status

| ASVS Category | Key Check | Status |
|---|---|---|
| V2 — Authentication | JWT TTL, refresh rotation, brute-force protection | Designed |
| V3 — Session Management | HttpOnly cookie, SameSite=Strict | Designed |
| V4 — Access Control | Financial data scoped to owner's PAN only | Designed |
| V5 — Validation | Zod schemas on all inputs; PAN regex validation | Designed |
| V6 — Cryptography | HMAC-SHA256 for PAN/card hashes; bcrypt for passwords | Designed |
| V7 — Error Handling | Generic error messages; no stack traces to client | Designed |
| V8 — Data Protection | PAN never logged; sensitive fields excluded from responses | Designed |
| V9 — Communication | TLS 1.2+ enforced; HSTS header via helmet | Helmet configured |
| V10 — Malicious Code | Dependency scanning; `npm audit` in CI; ESLint security plugin | Designed |
| V12 — Files | No user file upload endpoints planned | N/A |
| V13 — API | Rate limiting; versioned API (`/api/v1/`) | Designed |
| V14 — Config | Secrets via env vars; no secrets in image | Designed |

### V7 — Error Handling — Design

Express uses a single global error middleware registered last in `app.ts`. All route handlers pass errors to `next(err)` rather than handling them inline.

```
apps/api/src/middleware/error.middleware.ts
```

Behaviour:

| Error type | HTTP status | Client response | Server log |
|---|---|---|---|
| `ZodError` (validation) | 422 | `{ error: { code: "VALIDATION_ERROR", fields: {...} } }` | Warn |
| Known `AppError` (thrown with `code` + `status`) | As set | `{ error: { code, message } }` | Info |
| Everything else | 500 | `{ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } }` | Error with full stack |

Key invariants enforced by this middleware:
- Stack traces **never** appear in the response body — in any environment.
- The generic 500 message is a hardcoded string, never derived from `err.message`.
- All unhandled errors are logged with `requestId` (from `x-request-id` header) for correlation.
- The `message` field in `AppError` responses is a human-readable string sourced from the i18n locale file (see `skills/i18n.md`) — never a raw internal message.
- The error middleware is registered **after** all route definitions and before the process `uncaughtException` handler.

`AppError` shape (thrown by service layer):
```ts
class AppError extends Error {
  constructor(
    public readonly code: string,   // UPPER_SNAKE_CASE, e.g. PAN_NOT_FOUND
    public readonly status: number, // HTTP status
    message: string                 // i18n-resolved message
  ) { super(message); }
}
```

### V10 — Malicious Code — Design

Three enforcement layers:

**1. Developer machine (pre-commit hook via Husky)**
```bash
npm audit --audit-level=high   # run in apps/web and apps/api
eslint --plugin security .     # no eval(), Function(), exec() with user input
```
A commit is blocked if either command exits non-zero.

**2. CI (PR merge gate — GitHub Actions)**
```yaml
- name: Audit dependencies
  run: |
    cd apps/web && npm audit --audit-level=moderate
    cd ../api  && npm audit --audit-level=moderate
```
PRs cannot merge if any moderate, high, or critical vulnerability is found.
`npm ci` (not `npm install`) is used throughout CI to enforce the lock file.

**3. Docker build gate**
The `builder` stage in the Dockerfile runs `npm audit --audit-level=high` before the production build. The image fails to build if vulnerable packages are present.

Additional controls:
- `package-lock.json` is committed for both apps; CI uses `npm ci`.
- Dependabot is enabled for weekly automated dependency update PRs.
- `eslint-plugin-security` is a dev dependency in both apps; its rules run in the pre-commit hook and CI lint step.
- No `eval()`, `new Function()`, or `child_process.exec()` with user-controlled input — enforced by ESLint rules `security/detect-eval-with-expression` and `security/detect-child-process`.

### OWASP Top 10 (2021) Cross-Reference

ASVS L2 is a superset of the OWASP Top 10. This table maps each Top 10 category to its corresponding ASVS control in this design.

| OWASP Top 10 (2021) | Covered by | Design reference |
|---|---|---|
| A01 — Broken Access Control | V4 | Financial data scoped to authenticated user's PAN only |
| A02 — Cryptographic Failures | V6 | HMAC-SHA256 for PAN/card; bcrypt for passwords; TLS 1.2+ |
| A03 — Injection | V5 | Zod validation on all inputs; parameterized queries via Drizzle/pg |
| A04 — Insecure Design | V1 / architecture | Threat-modelled architecture; security-first design mandates |
| A05 — Security Misconfiguration | V14 + V9 | Secrets via env vars; helmet headers; no debug endpoints in production |
| A06 — Vulnerable & Outdated Components | V10 | `npm audit` at pre-commit, CI, and Docker build; Dependabot |
| A07 — Identification & Authentication Failures | V2 + V3 | JWT TTL + rotation; HttpOnly cookie; brute-force rate limiting |
| A08 — Software & Data Integrity Failures | V10 | Lock files committed; `npm ci` in CI; Docker build audit gate |
| A09 — Security Logging & Monitoring Failures | V7 + V8 | Structured pino logs with `requestId`; `audit_logs` table; CERT-In 180-day retention |
| A10 — Server-Side Request Forgery | N/A | No user-supplied URLs are fetched server-side |

---

## Compliance Additions to the Data Model

The following columns / tables need to be added to support DPDP and audit requirements:

```sql
-- Consent tracking (DPDP Act)
ALTER TABLE users
  ADD COLUMN consent_given_at  TIMESTAMPTZ,
  ADD COLUMN consent_version   VARCHAR(20),
  ADD COLUMN deleted_at        TIMESTAMPTZ;   -- soft delete for right-to-erasure

-- Data export / erasure requests (DPDP right-to-access, right-to-erasure)
CREATE TABLE data_requests (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  request_type VARCHAR(20) NOT NULL CHECK (request_type IN ('EXPORT', 'ERASURE')),
  status       VARCHAR(20) NOT NULL DEFAULT 'PENDING',  -- PENDING / IN_PROGRESS / COMPLETED
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

---

## Compliance Checklist for Launch

- [ ] PCI DSS SAQ completed; QSA engaged if required
- [ ] VAPT by CERT-In empanelled auditor completed; critical findings remediated
- [ ] PostgreSQL deployed in India region only (RBI data localisation)
- [ ] Privacy policy drafted covering DPDP consent, data minimisation, right-to-erasure
- [ ] Consent screen implemented; `users.consent_given_at` and `consent_version` populated
- [ ] `DELETE /users/me` (right-to-erasure) endpoint implemented and tested
- [ ] `audit_logs` retention: 180-day minimum in India (CERT-In); archive to cold storage after
- [ ] NTP sync configured on all servers to NIC/NPCI time sources
- [ ] CERT-In incident reporting runbook written; 6-hour SLA defined
- [ ] SOC 2 readiness assessment completed; observation period started if pursuing certification
- [ ] SEBI / IRDAI data masking verified: folio numbers and policy numbers masked in all API responses
- [ ] `npm audit` / Snyk integrated into CI pipeline
- [ ] Key rotation schedule documented for `PAN_HMAC_SECRET` and JWT secrets
