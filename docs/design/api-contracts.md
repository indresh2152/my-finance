# API Contracts

Base URL: `/api/v1`  
Content-Type: `application/json`  
Currency: All monetary values are in **INR (₹)** as `number` with 2 decimal places.  
Auth: `Authorization: Bearer <accessToken>` on all protected routes.

**Financial instrument endpoints are read-only.** There are no POST/PUT/DELETE endpoints for credit cards, bank accounts, loans, investments, or insurance policies. All instrument data is fetched from external sources (or entered by seed/admin tooling) and displayed to the authenticated owner. Users cannot manually add or edit instruments in v1.

**PAN requirement:** All financial data endpoints (`/overview`, `/credit-cards`, `/bank-accounts`, `/loans`, `/investments`, `/insurance`) require a registered PAN. If the authenticated user has no PAN, these endpoints return `403 PAN_NOT_REGISTERED`. Frontend should detect this code and redirect to the PAN registration flow rather than treating it as a generic "access denied."

---

## Infrastructure Endpoints

These routes exist at the root (not under `/api/v1`) and require no authentication. Used by Docker health checks and K8s probes.

### GET /health

Liveness probe — confirms the Node.js process is running. Does **not** check the database.

**Response 200**
```json
{ "status": "ok", "timestamp": "2026-06-06T10:00:00.000Z" }
```

### GET /ready

Readiness probe — confirms the app can serve traffic by verifying the database connection is reachable.

**Response 200** (DB reachable)
```json
{ "status": "ready", "db": "connected" }
```

**Response 503** (DB not reachable — pod should not receive traffic yet)
```json
{ "status": "not ready", "db": "unreachable" }
```

---

## Auth

### POST /auth/register

Creates a new user account. Rate-limited to 10 requests/hour per IP to slow automated signups.

**Request**
```json
{
  "username": "indresh",
  "email":    "indresh@example.com",
  "password": "S3cur3P@ss!"
}
```

Validation rules (Zod):
- `username`: 3–50 chars, alphanumeric + underscores only
- `email`: valid email format
- `password`: minimum 8 chars; must contain at least one uppercase, one digit, one special character

**Response 201**
```json
{
  "accessToken": "<jwt>",
  "user": {
    "id":       "uuid",
    "username": "indresh",
    "email":    "indresh@example.com",
    "hasPan":   false
  }
}
```
`refreshToken` set as `HttpOnly; SameSite=Strict; Secure` cookie.  
Writes `USER_REGISTER` to `audit_logs`.

**Response 409**
```json
{ "error": { "code": "USERNAME_TAKEN",    "message": "Username is already taken" } }
{ "error": { "code": "EMAIL_TAKEN",       "message": "Email is already registered" } }
```

---

### POST /auth/login

**Request**
```json
{
  "username": "indresh",
  "password": "s3cret"
}
```

**Response 200**
```json
{
  "accessToken": "<jwt>",
  "user": {
    "id": "uuid",
    "username": "indresh",
    "email": "indresh@example.com",
    "hasPan": true
  }
}
```
`refreshToken` set as `HttpOnly; SameSite=Strict; Secure` cookie.

**Response 401**
```json
{ "error": { "code": "INVALID_CREDENTIALS", "message": "Username or password incorrect" } }
```

---

### POST /auth/refresh

Uses the `refreshToken` cookie. No body needed.

**Response 200**
```json
{ "accessToken": "<new jwt>" }
```

---

### POST /auth/logout

**Response 204** — no body.

---

## PAN Profile

### POST /pan/register

Registers the authenticated user's Permanent Account Number.

**Request**
```json
{
  "pan": "ABCDE1234F"
}
```
PAN is validated server-side with `/^[A-Z]{5}[0-9]{4}[A-Z]$/` before hashing. Full PAN is never stored.

**Response 201**
```json
{
  "id": "uuid",
  "panMasked": "ABCDE####F",
  "verifiedAt": null
}
```

**Response 400**
```json
{ "error": { "code": "INVALID_PAN_FORMAT", "message": "PAN must be 10 characters: 5 letters, 4 digits, 1 letter" } }
```

**Response 409**
```json
{ "error": { "code": "PAN_ALREADY_REGISTERED", "message": "A PAN is already linked to this account" } }
```

---

### GET /pan

Returns the user's registered PAN profile.

**Response 200**
```json
{
  "id": "uuid",
  "panMasked": "ABCDE####F",
  "verifiedAt": "2025-01-15T10:30:00Z"
}
```

**Response 404**
```json
{ "error": { "code": "PAN_NOT_REGISTERED", "message": "No PAN registered for this account" } }
```

---

## Financial Overview

### GET /overview

Returns a summary of all financial instruments linked to the user's PAN — one number per category.

**Response 200**
```json
{
  "panMasked": "ABCDE####F",
  "summary": {
    "totalCreditLimit":      1000000.00,
    "totalCreditBalance":    167000.00,
    "totalBankBalance":      850000.00,
    "totalLoanOutstanding":  4200000.00,
    "totalInvestmentValue":  1250000.00,
    "totalInsuredAmount":    5000000.00
  },
  "counts": {
    "creditCards":    3,
    "bankAccounts":   2,
    "loans":          1,
    "investments":    5,
    "insurancePolicies": 2
  }
}
```

---

## Credit Cards

### GET /credit-cards

Returns all credit cards linked to the user's PAN.

**Response 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "cardNumberLast4": "1234",
      "cardNetwork": "VISA",
      "issuingBank": "HDFC Bank",
      "cardVariant": "PLATINUM",
      "nameOnCard": "INDRESH RATHORE",
      "expiryMonth": 12,
      "expiryYear": 2028,
      "status": "ACTIVE",
      "creditLimit": 500000.00,
      "availableCredit": 423000.00,
      "currentBalance": 77000.00,
      "billingCycleDay": 15
    }
  ],
  "meta": { "total": 3 }
}
```

---

### GET /credit-cards/:cardId

Returns a single card (same shape as above, single object).

---

## Bank Accounts

### GET /bank-accounts

**Response 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "accountNumberLast4": "5678",
      "accountType": "SAVINGS",
      "bankName": "HDFC Bank",
      "ifscPrefix": "HDFC",
      "balance": 450000.00,
      "status": "ACTIVE"
    },
    {
      "id": "uuid",
      "accountNumberLast4": "0012",
      "accountType": "FD",
      "bankName": "SBI",
      "balance": 400000.00,
      "interestRate": 7.25,
      "maturityDate": "2026-03-31",
      "status": "ACTIVE"
    }
  ],
  "meta": { "total": 2 }
}
```

---

## Loans

### GET /loans

**Response 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "loanAccountLast4": "9900",
      "loanType": "HOME",
      "lender": "SBI",
      "principalAmount": 5000000.00,
      "outstandingAmount": 4200000.00,
      "emiAmount": 45000.00,
      "emiDueDay": 5,
      "interestRate": 8.50,
      "maturityDate": "2041-06-01",
      "status": "ACTIVE"
    }
  ],
  "meta": { "total": 1 }
}
```

---

## Investments

### GET /investments

**Response 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "investmentType": "MUTUAL_FUND",
      "institutionName": "Mirae Asset AMC",
      "schemeName": "Mirae Asset Large Cap Fund - Direct Growth",
      "folioDisplay": "FOL12345",
      "unitsOrQuantity": 1523.456,
      "currentValue": 85000.00,
      "investedAmount": 60000.00,
      "asOfDate": "2026-06-05"
    },
    {
      "id": "uuid",
      "investmentType": "PPF",
      "institutionName": "SBI",
      "schemeName": "Public Provident Fund",
      "currentValue": 450000.00,
      "investedAmount": 400000.00,
      "asOfDate": "2026-03-31"
    }
  ],
  "meta": { "total": 5 }
}
```

---

## Insurance

### GET /insurance

**Response 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "policyNumberMasked": "LIC****9012",
      "policyType": "LIFE",
      "insurer": "LIC of India",
      "planName": "Jeevan Anand",
      "sumAssured": 2500000.00,
      "premiumAmount": 35000.00,
      "premiumFrequency": "YEARLY",
      "nextDueDate": "2027-01-01",
      "maturityDate": "2040-01-01",
      "status": "ACTIVE"
    },
    {
      "id": "uuid",
      "policyNumberMasked": "STAR****5678",
      "policyType": "HEALTH",
      "insurer": "Star Health Insurance",
      "planName": "Comprehensive Health Plan",
      "sumAssured": 1000000.00,
      "premiumAmount": 18000.00,
      "premiumFrequency": "YEARLY",
      "nextDueDate": "2026-11-15",
      "status": "ACTIVE"
    }
  ],
  "meta": { "total": 2 }
}
```

---

## Users

### GET /users/me

**Response 200**
```json
{
  "id": "uuid",
  "username": "indresh",
  "email": "indresh@example.com",
  "isActive": true,
  "pan": {
    "id": "uuid",
    "panMasked": "ABCDE####F",
    "verifiedAt": "2025-01-15T10:30:00Z"
  }
}
```

---

### PATCH /users/me

Updates the authenticated user's password or email. Requires the current password to be supplied for all changes.

**Request**
```json
{
  "currentPassword": "OldP@ss!",
  "newPassword": "NewP@ss2!"
}
```

Or to change email:
```json
{
  "currentPassword": "OldP@ss!",
  "newEmail": "newemail@example.com"
}
```

**Response 200**
```json
{ "message": "Profile updated successfully" }
```

**Response 400**
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "New password must be at least 8 characters" } }
```

**Response 401**
```json
{ "error": { "code": "WRONG_PASSWORD", "message": "Current password is incorrect" } }
```

Writes `USER_PROFILE_UPDATE` to `audit_logs`.

---

### DELETE /users/me

Initiates DPDP right-to-erasure. Creates a `data_requests` row with `request_type='ERASURE'`. The account is soft-deleted immediately (`users.deleted_at` set); a background job completes full data deletion after 30 days.

**Request** — no body required.

**Response 202** (accepted, deletion is asynchronous)
```json
{
  "message": "Account deletion scheduled. Your data will be permanently removed within 30 days.",
  "requestId": "uuid"
}
```

**Response 401**
```json
{ "error": { "code": "UNAUTHORIZED", "message": "Authentication required" } }
```

Writes `USER_DELETE` to `audit_logs`.

---

### GET /users/me/data-export

Initiates DPDP right-to-access. Creates a `data_requests` row with `request_type='EXPORT'`. The export is assembled asynchronously; delivery mechanism (email link or in-app download) is TBD.

**Response 202**
```json
{
  "message": "Data export requested. You will receive your data within 72 hours.",
  "requestId": "uuid"
}
```

Writes `DATA_EXPORT_REQUEST` to `audit_logs` (add to `audit_action` enum before implementing).

---

## Audit Logs

### GET /audit-logs

Returns the authenticated user's own audit log entries. Users can only see their own logs — there is no admin view in v1.

**Query parameters**

| Param    | Type   | Default | Description                                           |
|----------|--------|---------|-------------------------------------------------------|
| `limit`  | int    | 50      | Max rows per page (max: 200)                          |
| `offset` | int    | 0       | Pagination offset                                     |
| `action` | string | —       | Filter by action, e.g. `CARD_VIEW`                    |
| `from`   | ISO date | —    | Filter `created_at >= from`                           |
| `to`     | ISO date | —    | Filter `created_at <= to`                             |

**Response 200**
```json
{
  "data": [
    {
      "id":           "uuid",
      "action":       "CARD_VIEW",
      "resourceType": "credit_card",
      "resourceId":   "uuid",
      "ipAddress":    "203.0.113.42",
      "metadata":     { "statusCode": 200, "durationMs": 12 },
      "createdAt":    "2026-06-06T08:22:11.000Z"
    },
    {
      "id":           "uuid",
      "action":       "USER_LOGIN",
      "resourceType": null,
      "resourceId":   null,
      "ipAddress":    "203.0.113.42",
      "metadata":     null,
      "createdAt":    "2026-06-06T08:20:05.000Z"
    }
  ],
  "meta": {
    "total":  142,
    "limit":  50,
    "offset": 0
  }
}
```

Writes `AUDIT_LOG_VIEW` to `audit_logs` when this endpoint is called.

---

## Error Shape

All errors follow:
```json
{
  "error": {
    "code": "MACHINE_READABLE_CODE",
    "message": "Human-readable explanation"
  }
}
```

| HTTP Status | When                                      |
|-------------|-------------------------------------------|
| 400         | Validation failure (Zod) or invalid PAN format |
| 401         | Missing or expired token (`UNAUTHORIZED`) |
| 403         | Token valid but access denied — includes `PAN_NOT_REGISTERED` (user has no PAN yet) |
| 404         | Resource not found                        |
| 409         | Conflict — e.g. PAN already registered   |
| 429         | Rate limit exceeded                       |
| 500         | Unexpected server error                   |

**Important 401 vs 403 distinction:** Never return 401 for a missing PAN — that would trigger the frontend's silent token-refresh loop. Return 403 with `code: "PAN_NOT_REGISTERED"` so the frontend can show the PAN registration prompt instead.
