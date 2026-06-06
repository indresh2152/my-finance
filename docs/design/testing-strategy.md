# Testing Strategy

## Principles

1. **Tests are written in the same session as the code.** There is no "add tests later" — untested code is incomplete code.
2. **Test public behaviour, not implementation.** Tests verify what a unit does, not how it does it internally. This allows safe refactoring.
3. **80 % coverage is the required floor.** Meeting the threshold means key paths were executed; it does not mean every edge case was considered. Write tests for all branches, error paths, and boundary values — coverage is the safety net, not the ceiling.
4. **Test code is production-quality code.** All ISO-level standards (naming, structure, no magic values, no `any`) apply equally to test files.

---

## Testing pyramid

```
        ┌──────────────────────┐
        │  E2E / smoke (few)   │  Playwright — critical user journeys only
        ├──────────────────────┤
        │  Integration (some)  │  Supertest against real Express app
        ├──────────────────────┤
        │  Unit (many, fast)   │  Vitest (frontend) · Jest (backend)
        └──────────────────────┘
```

The majority of tests are units. Integration tests cover route → service → DB-mock paths. E2E tests are reserved for critical journeys (login, PAN registration, card list) and are not in scope for the initial release.

---

## Frontend — Vitest + React Testing Library

**Stack:**
- `vitest` — test runner, compatible with Vite config
- `@vitest/coverage-v8` — V8-based coverage (no Istanbul instrumentation overhead)
- `@testing-library/react` + `@testing-library/user-event` — component rendering and interaction
- `@testing-library/jest-dom` — DOM matchers (`toBeInTheDocument`, `toHaveValue`, etc.)
- `msw` — Mock Service Worker for intercepting HTTP at the network level

**Coverage threshold: 80 %** — enforced identically at commit time and in CI. Applies to lines, branches, functions, and statements. Single config: `vite.config.ts`.

**What is tested:**
- Every React component (render output, user interactions, conditional branches, loading/error states)
- Every custom hook (state transitions, side effects, return values)
- Every utility function (pure logic, validation, formatting)
- Every API client function (happy path + HTTP error codes)

**What is excluded from coverage:**
- `src/main.tsx` (app entry point — tested by integration)
- `src/**/*.d.ts` (type declarations)
- `src/test/**` (test infrastructure)

**Running:**
```bash
cd apps/web
npx vitest                         # watch mode
npx vitest run --coverage          # single run (80% gate — local and CI)
open coverage/index.html           # browse uncovered lines
```

---

## Backend — Jest

**Stack:**
- `jest` + `ts-jest` — test runner with TypeScript support
- `supertest` — HTTP assertions against Express `app` instance
- `@types/jest`, `@types/supertest`

**Coverage threshold: 80 %** — enforced identically at commit time and in CI. Applies to lines, branches, functions, and statements. Single config: `jest.config.ts`.

**What is tested:**
- Every service method (unit — DB injected as mock)
- Every middleware (unit — mock `req` / `res` / `next`)
- Every route handler (integration via Supertest — all status code paths)
- Every utility / helper function
- Every Zod schema (valid input, each invalid case)
- Every SQL migration (schema state, idempotency, data correctness where applicable)

**What is excluded from coverage:**
- `src/index.ts` (server bootstrap — tested by docker-run smoke tests)

**Running:**
```bash
cd apps/api
npx jest --watch                                      # watch mode
npx jest --coverage                                   # single run (80% gate — local and CI)
npx jest src/services/pan.service.test.ts             # single file
```

---

## Migration testing

SQL migrations are treated as production code and require tests.

**Test database:** A dedicated `TEST_DATABASE_URL` pointing to a separate Postgres database (never dev or prod).

**Each migration test verifies:**
1. The migration applies without error
2. The expected tables / columns / constraints exist after migration
3. The migration is idempotent (runs twice without error or data duplication)
4. For data migrations: the transformation is correct and complete

Migration test files live next to their SQL files:
```
src/migrations/
  001_create_users.sql
  001_create_users.test.ts
  002_create_pan_profiles.sql
  002_create_pan_profiles.test.ts
```

---

## Commit gates — commitlint and husky

Two git hooks enforce quality at commit time. Neither can be bypassed with `--no-verify`.

### `commit-msg` — commitlint (message format)

Every commit message must satisfy the **Conventional Commits** format:
```
type(scope): description
```

`commitlint` runs in the `commit-msg` hook and aborts the commit immediately if the message is malformed — before any tests execute. See `code-quality.md` → "Commit message format" for the full type/scope list and examples.

### `pre-commit` — code quality + 80 % coverage gate

The pre-commit hook runs in order:
1. `tsc --noEmit` — type errors block the commit
2. `eslint . --max-warnings 0` — any lint warning blocks the commit
3. `prettier --check .` — any formatting deviation blocks the commit
4. `vitest run --coverage` in `apps/web` — coverage below 80 % blocks the commit
5. `jest --coverage` in `apps/api` — coverage below 80 % blocks the commit

The hook uses `vite.config.ts` and `jest.config.ts`, which set the 80 % threshold — the same config CI uses.

---

## Coverage enforcement in CI

Both apps must emit an `lcov.info` coverage report. The CI pipeline uses the same configs as the local pre-commit hook:

1. Runs `npx vitest run --coverage` in `apps/web` — fails if any threshold is below **80 %**
2. Runs `npx jest --coverage` in `apps/api` — fails if any threshold is below **80 %**
3. Uploads both `lcov.info` files to the coverage tracker (e.g., Codecov)

| Where | Threshold | Config |
|---|---|---|
| Developer's machine (pre-commit) | **80 %** | `vite.config.ts` / `jest.config.ts` |
| CI pipeline (PR merge gate) | **80 %** | same |

A PR that drops coverage below 80 % in any metric (lines, branches, functions, statements) is blocked from merging.

**Exclusions require approval.** The only valid reasons to exclude a line from coverage are:
- Auto-generated code (e.g., Drizzle schema type outputs)
- Environment-specific bootstrap that cannot be tested in isolation

All exclusions must be documented in this section when added.

---

## Test file naming and placement

| Source file | Test file |
|---|---|
| `src/components/CreditCardList.tsx` | `src/components/CreditCardList.test.tsx` |
| `src/hooks/useFormatCurrency.ts` | `src/hooks/useFormatCurrency.test.ts` |
| `src/utils/pan.ts` | `src/utils/pan.test.ts` |
| `src/services/pan.service.ts` | `src/services/pan.service.test.ts` |
| `src/middleware/auth.middleware.ts` | `src/middleware/auth.middleware.test.ts` |
| `src/routes/credit-cards.router.ts` | `src/routes/credit-cards.router.test.ts` |
| `src/migrations/001_create_users.sql` | `src/migrations/001_create_users.test.ts` |

Tests are always co-located — never in a separate `__tests__/` directory.

---

## Prohibited patterns

| Pattern | Why |
|---|---|
| `test.only` / `it.only` committed to a branch | Silently skips all other tests in CI |
| `test.skip` / `xit` | Deferred test = missing coverage |
| `jest.mock('../someInternalModule')` | Hides design problems; use dependency injection instead |
| `/* istanbul ignore next */` or `/* c8 ignore */` without documented approval | Hides untested code |
| Assertions on CSS class names | Couples tests to implementation details |
| `container.querySelector` in RTL tests | Bypasses accessibility-first query priority |
| Empty `catch {}` in tests | Masks assertion failures |
