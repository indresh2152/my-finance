---
name: backend-testing
description: Backend unit testing with Jest — 80% coverage required at commit and in CI, including migrations
---

**Trigger:** Any time backend code is written or modified in `apps/api/`. Tests are written in the same session as the code — never deferred.

## Coverage policy

**Threshold: 80 %** — enforced identically at commit time (pre-commit hook) and in CI (PR merge gate). Applies to lines, branches, functions, and statements.

No coverage exclusion comments are permitted (`/* istanbul ignore */`) without documented approval in `docs/design/testing-strategy.md`.

## Stack

```bash
npm install -D jest ts-jest @types/jest supertest @types/supertest
```

**`jest.config.ts`** — single config used by both the pre-commit hook and CI:
```ts
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testMatch: ['**/*.test.ts'],
  collectCoverage: true,
  coverageDirectory: '../coverage',
  coverageProvider: 'v8',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: { lines: 80, branches: 80, functions: 80, statements: 80 },
  },
  coveragePathIgnorePatterns: ['/node_modules/', 'src/index.ts'],
};

export default config;
```

## File placement

Tests co-located with source — never in a separate `__tests__/` tree:
```
src/
  services/
    pan.service.ts
    pan.service.test.ts       ← co-located
  middleware/
    auth.middleware.ts
    auth.middleware.test.ts
  routes/
    credit-cards.router.ts
    credit-cards.router.test.ts
  migrations/
    001_create_users.sql
    001_create_users.test.ts  ← migration test
  utils/
    pan.ts
    pan.test.ts
```

## Naming convention

```ts
describe('PanService', () => {
  describe('hashPan', () => {
    it('should return a 64-character hex HMAC-SHA256 digest', () => { ... });
    it('should return the same hash for the same input and secret', () => { ... });
    it('should throw PanValidationError when PAN format is invalid', () => { ... });
  });
});
```

Pattern: `should <expected behaviour> when <condition>`.

## Test structure (AAA)

```ts
it('should reject a PAN that contains lowercase letters', () => {
  // Arrange
  const invalidPan = 'abcde1234f';

  // Act & Assert
  expect(() => panService.validate(invalidPan)).toThrow(PanValidationError);
});
```

## Service / utility unit tests

Inject all dependencies — never import DB or config directly in production code:
```ts
// pan.service.ts
export class PanService {
  constructor(
    private readonly db: Database,
    private readonly hmacSecret: string,
  ) {}
  // ...
}

// pan.service.test.ts
const mockDb = { query: jest.fn() };
const service = new PanService(mockDb as unknown as Database, 'test-secret');
```

Mock only the outer boundary (DB, HTTP clients, crypto when determinism is needed). Do not mock internal service methods.

## Route / integration tests with Supertest

Use Supertest against a real Express `app` instance — not against a running server:
```ts
import request from 'supertest';
import { createApp } from '../app';

const app = createApp({ db: mockDb, jwtSecret: 'test-secret' });

it('should return 401 when Authorization header is missing', async () => {
  const res = await request(app).get('/api/v1/credit-cards');
  expect(res.status).toBe(401);
  expect(res.body.error.code).toBe('UNAUTHORIZED');
});

it('should return 200 with card list for authenticated user', async () => {
  mockDb.query.mockResolvedValueOnce({ rows: [mockCard] });
  const res = await request(app)
    .get('/api/v1/credit-cards')
    .set('Authorization', `Bearer ${validToken}`);
  expect(res.status).toBe(200);
  expect(res.body.cards).toHaveLength(1);
});
```

Cover every HTTP status code path the route can return (200, 400, 401, 403, 404, 422, 500).

## Middleware tests

Test middleware as isolated functions — pass mock `req`, `res`, `next`:
```ts
import { authMiddleware } from './auth.middleware';

it('should call next() when token is valid', () => {
  const req = { headers: { authorization: 'Bearer valid-token' } } as Request;
  const res = {} as Response;
  const next = jest.fn();

  authMiddleware(req, res, next);

  expect(next).toHaveBeenCalledTimes(1);
  expect(next).toHaveBeenCalledWith(); // no error argument
});
```

## Migration tests

Every SQL migration file gets a corresponding test that:
1. Applies the migration to an in-memory or test Postgres instance
2. Verifies the expected schema state (table exists, columns have correct types/constraints)
3. Verifies the migration is idempotent (can run twice without error)
4. For data migrations: verifies data is transformed correctly

```ts
import { Pool } from 'pg';
import { runMigration } from '../migrations/runner';

describe('Migration 001: create_users', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await runMigration(pool, '001_create_users.sql');
  });

  afterAll(() => pool.end());

  it('should create the users table', async () => {
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'users'`
    );
    expect(rows).toHaveLength(1);
  });

  it('should have a non-nullable id column of type uuid', async () => {
    const { rows } = await pool.query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_name = 'users' AND column_name = 'id'`
    );
    expect(rows[0].data_type).toBe('uuid');
    expect(rows[0].is_nullable).toBe('NO');
  });
});
```

Use a dedicated `TEST_DATABASE_URL` pointing to a separate test database. Never run migration tests against the development or production database.

## Error path coverage

For every service method or handler, test:
- Happy path (valid input, DB succeeds)
- Validation failure (invalid input format)
- DB failure (mock DB to throw)
- Not-found case (mock DB returns empty result)
- Authorization failure (wrong user, missing role)

## Mocking guidelines

- Mock DB at the query level (`db.query`, `db.transaction`) — not entire models
- Use `jest.spyOn` over `jest.fn()` when you want to preserve the original implementation for other tests
- Reset all mocks between tests: `afterEach(() => jest.clearAllMocks())`
- Never use `jest.mock()` on internal modules — it hides design problems; use dependency injection instead

## Running tests

```bash
# Watch mode during development
cd apps/api && npx jest --watch

# Single run + coverage (80% gate — same threshold locally and in CI)
cd apps/api && npx jest --coverage

# Run a single file
cd apps/api && npx jest src/services/pan.service.test.ts
```

## What the 80 % threshold means in practice

The coverage gate passes only if, across the whole codebase:
- The majority of `if`/`else` branches have a test for each side
- Most `catch` blocks have a test that triggers the error
- Most early-return paths have a test
- Most Zod schema parse failure paths are tested

Aim to cover every case; 80 % is the minimum bar, not the target.
