---
name: backend
description: Backend coding standards for Node.js + Express + TypeScript — validation, error shapes, logging, security
---

**Trigger:** Always applied when writing or reviewing backend code in `apps/api/`.

> **Also apply:** `code-quality` (ISO-level standards for all code) and `backend-testing` (Jest, 80% coverage). Every service, middleware, route handler, and migration written here requires a co-located test file written in the same session.

## TypeScript

- Strict mode enabled (`"strict": true` in tsconfig) — no `any`
- Use Zod for all input validation at route boundaries
- Return type annotations on all route handlers and service functions

## Input validation

Always validate with Zod before touching the database:
```ts
import { z } from 'zod';

const panSchema = z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Invalid PAN format');
```

## Error responses

All error responses must use this exact shape:
```json
{ "error": { "code": "PAN_INVALID", "message": "PAN format is invalid" } }
```

Use consistent `code` strings so the frontend can key on them.

## Error handling middleware (V7 — OWASP ASVS)

Register a single global error middleware **last** in `app.ts`, after all routes. Never handle errors inline in route handlers — always call `next(err)`.

```ts
// apps/api/src/middleware/error.middleware.ts
export function errorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(422).json({ error: { code: 'VALIDATION_ERROR', fields: err.flatten() } });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  logger.error({ err, requestId: req.headers['x-request-id'] }, 'Unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
}
```

Three invariants that must never be broken:
- Stack traces never appear in the response body — in any `NODE_ENV`.
- The 500 message is a hardcoded string, never `err.message`.
- Unhandled errors are always logged with `requestId` for correlation.

`AppError` (thrown by the service layer):
```ts
class AppError extends Error {
  constructor(
    public readonly code: string,   // UPPER_SNAKE_CASE
    public readonly status: number,
    message: string                 // i18n-resolved; see skills/i18n.md
  ) { super(message); }
}
```

## Database

- snake_case column names in PostgreSQL; camelCase in the TypeScript layer — use a mapper function
- All queries use parameterized statements — no string interpolation with user input
- Store currency as `NUMERIC(15,2)` in INR
- Never store PAN in plaintext — only `pan_hash` (HMAC-SHA256) + `pan_masked` (e.g. `ABCDE####F`)
- Account numbers hashed; only last 4 digits stored for display

## Logging

Never log sensitive fields: `pan`, `pan_hash`, `account_number`, `policy_number`.
Use structured logging (e.g. `pino`) — log `user_id` and `request_id` for traceability, never raw PAN.

## Route conventions

- Group routes by resource: `auth`, `users`, `pan`, `credit-cards`, `overview`, etc.
- Prefix all API routes with `/api/v1/`
- SPA catch-all: Express serves `index.html` for all non-`/api/`, non-static GET routes
- Health: `GET /health` → 200 fast (no DB). Readiness: `GET /ready` → checks DB connectivity

## API documentation (OpenAPI) — keep in lockstep with routes

The OpenAPI spec served at `/api/docs` is built in `apps/api/src/docs/openapi.ts`. **Any change to an API endpoint must make the same change to the API docs in the same commit.** Nothing is done until the docs match the code.

| Route change | Required docs change |
|---|---|
| **Added** endpoint | Add a `registry.registerPath(...)` entry with method, path, tag, summary, `security: bearer` (unless it is public), request body/params, and **every** status code the handler can return |
| **Modified** endpoint (path, method, auth, request body, query/path params, response shape, status codes, rate limit → 429) | Update the matching `registerPath` entry and any registered schemas to match |
| **Removed** endpoint | Delete its `registerPath` entry, plus any schemas and `apiDocs.*` locale keys that are no longer used |

Rules:
- **Reuse the route's Zod schema** (the `build*Schema(lng)` factory exported from the routes file) for request bodies. Never copy a schema into `openapi.ts`, because the docs will drift from what the route actually validates.
- Response schemas must match what the handler really sends: field names, nullability, and the `{ error: { code, message } }` error shape.
- Every summary, description, and tag comes from `apiDocs.*` keys in `apps/api/src/locales/<lang>.json` (see `skills/i18n.md`). Add the key to **every** locale file.
- **A new router must be added to the `listRoutes(...)` list** in `apps/api/src/docs/api-docs.router.test.ts` (test: "should document every API route except cookie-authenticated ones"). That test only compares the routers it lists, so a router left out of the list can go undocumented without failing it.
- Routes that are intentionally undocumented, such as cookie-authenticated ones, go in `UNDOCUMENTED_ROUTES` in that test with a comment explaining why. Leaving a route out of the docs for any other reason is not allowed.
- If the public/bearer split changes, update the `publicRoutes` list in the "should require the bearer token" test.
- Also update the contract in `docs/design/api-contracts.md` so the design doc matches the code.
- Verify by running `npm test -w apps/api -- api-docs`, then with `API_DOCS_ENABLED=true` open `/api/docs` and check the endpoint renders correctly.

## Auth

- JWT access token (short-lived) + refresh token (HTTP-only cookie, long-lived)
- Verify JWT on every protected route via auth middleware — never in route handlers directly
- Rate limit: login 5 req/min/IP; PAN registration 3 req/day/user

## Audit logging

Handled by `audit.middleware.ts` via `ROUTE_ACTION_MAP` — do not add per-route audit calls.
To audit a new route: add one entry to `ROUTE_ACTION_MAP`.

## Internationalisation (i18n)

See `skills/i18n.md` for the full standard — summary below.

**Install:**
```bash
npm install i18next i18next-fs-backend
```

- Call `await initI18n()` in `app.ts` before `app.listen()`.
- Add `localeMiddleware` to the Express chain after `express.json()` — it sets `req.language` from the `Accept-Language` header.
- Every `error.message` in API responses comes from `i18next.t('error.<code>', { lng: req.language })`. Never hardcode message strings.
- Zod validation messages are built via factory functions that receive `lng` and call `i18next.t('validation.<key>', { lng })`.
- Locale JSON files live in `apps/api/src/locales/<lang>.json` with top-level groups `error` and `validation`.
- In tests, always pass `lng: 'en'` explicitly so results are deterministic.
- **Error code casing:** The `code` field in API error responses is `UPPER_SNAKE_CASE` (e.g. `PAN_INVALID`). The i18n key is lowercase: `error.pan_invalid`. Always lowercase the code before the i18n lookup: `i18next.t(\`error.${code.toLowerCase()}\`, { lng })`.

## Graceful shutdown

Handle `SIGTERM`: stop accepting new connections, drain in-flight requests, close DB pool, then exit.
