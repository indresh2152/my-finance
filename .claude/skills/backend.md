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

## Auth

- JWT access token (short-lived) + refresh token (HTTP-only cookie, long-lived)
- Verify JWT on every protected route via auth middleware — never in route handlers directly
- Rate limit: login 5 req/min/IP; PAN registration 3 req/day/user

## Audit logging

Handled by `audit.middleware.ts` via `ROUTE_ACTION_MAP` — do not add per-route audit calls.
To audit a new route: add one entry to `ROUTE_ACTION_MAP`.

## Graceful shutdown

Handle `SIGTERM`: stop accepting new connections, drain in-flight requests, close DB pool, then exit.
