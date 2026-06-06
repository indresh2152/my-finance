---
name: code-quality
description: ISO-level coding standards applied to all code — frontend, backend, migrations, tests. Based on ISO/IEC 25010 quality model.
---

**Trigger:** Always applied when writing or reviewing any code in this repository.

These standards apply uniformly to production code, test code, migration scripts, and configuration. There is no tier where they can be relaxed.

---

## Naming

**Names are the primary documentation.** Code that needs a comment to explain what it does has a naming problem.

| Construct | Convention | Examples |
|---|---|---|
| Variables, params | `camelCase`, full words | `creditLimit`, `panHash`, `isAuthenticated` |
| Functions / methods | `camelCase`, verb phrase | `validatePan()`, `formatCurrency()`, `findCardsByPan()` |
| Classes, types, interfaces | `PascalCase` | `CreditCard`, `PanService`, `ApiErrorCode` |
| Constants (module-level) | `UPPER_SNAKE_CASE` | `MAX_LOGIN_ATTEMPTS`, `PAN_REGEX` |
| Booleans | `is*`, `has*`, `can*`, `should*` | `isExpired`, `hasLinkedPan`, `canViewCards` |
| Arrays | plural noun | `cards`, `transactions`, `auditEntries` |
| Generic type params | descriptive, not `T` | `TItem`, `TResponse`, or full words `Entity`, `Response` |

Never abbreviate unless the abbreviation is universally understood in the domain (`id`, `url`, `api`, `pan`, `jwt`, `hmac`). `usr`, `acnt`, `cfg`, `util` are not acceptable.

---

## Function design

- **Single responsibility:** a function does one thing and its name says exactly what that thing is
- **Maximum 30 lines** of code per function body (excluding blank lines and comments); extract when over
- **Maximum nesting depth of 3** — use early returns (guard clauses) to flatten:

  ```ts
  // Bad — deep nesting
  function process(card: CreditCard | null) {
    if (card) {
      if (card.isActive) {
        if (card.creditLimit > 0) { /* work */ }
      }
    }
  }

  // Good — early returns
  function process(card: CreditCard | null) {
    if (!card) return;
    if (!card.isActive) return;
    if (card.creditLimit <= 0) return;
    /* work */
  }
  ```

- **Cyclomatic complexity ≤ 10** per function (each `if`, `else`, `for`, `while`, `case`, `&&`, `||` adds 1)
- **Pure functions preferred** — no side effects unless the function name signals them (`save*`, `send*`, `update*`)
- **Immutability by default** — never mutate parameters; return new values

---

## TypeScript

- `"strict": true` in all `tsconfig.json` files — no weaker settings anywhere in the monorepo
- No `any` — use `unknown` with narrowing, or define proper types
- No non-null assertion (`!`) without a comment explaining why it is provably safe
- Explicit return types on all exported functions and class methods
- `readonly` on all properties that are not meant to mutate after construction
- Prefer discriminated unions over optional fields when modelling variant state:

  ```ts
  // Prefer this
  type ApiResult<T> =
    | { status: 'ok'; data: T }
    | { status: 'error'; code: string; message: string };

  // Over this
  type ApiResult<T> = { data?: T; error?: { code: string; message: string } };
  ```

- No `enum` — use `const` objects with `as const` and derive the union type:

  ```ts
  const AuditAction = {
    USER_LOGIN: 'USER_LOGIN',
    CARD_VIEW: 'CARD_VIEW',
  } as const;

  type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
  ```

---

## File and module structure

- **Maximum 300 lines** per file; split when over
- One primary export per file; filename matches the export (`PanService.ts` exports `PanService`)
- No circular dependencies — if A imports B and B imports A, extract the shared type to a third file
- Group imports: external packages → internal absolute paths → relative paths; blank line between groups
- No default exports in library/utility code — named exports only (easier to refactor and tree-shake)

---

## Error handling

- **Never swallow errors silently** — no empty `catch {}` blocks
- Define domain-specific error classes that extend `Error`:

  ```ts
  export class PanValidationError extends Error {
    readonly code = 'PAN_INVALID';
    constructor(message: string) {
      super(message);
      this.name = 'PanValidationError';
    }
  }
  ```

- Catch only what you can handle; let everything else propagate
- `catch (err: unknown)` — narrow with `instanceof` before accessing properties
- Log errors with `request_id` and `user_id` for traceability; never log raw PAN or account numbers

---

## Code that is forbidden

| Pattern | Reason |
|---|---|
| `// TODO`, `// FIXME`, `// HACK` | Deferred work belongs in a ticket, not the code |
| Commented-out code | It rots and confuses; delete it — git history is the archive |
| `console.log` in production paths | Use structured logger (`pino`) |
| Magic numbers / strings | Extract to a named constant |
| `process.exit()` outside `index.ts` shutdown handler | Makes code untestable |
| `as any`, `@ts-ignore`, `@ts-expect-error` without a comment | Silently breaks type safety |
| `eslint-disable` without a comment | Hides real problems |

---

## Formatting and linting

Every file must pass lint and format checks before commit. Configuration lives in `eslint.config.ts` and `.prettierrc`:

```json
// .prettierrc
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "semi": true
}
```

ESLint rules that are always `"error"` (not `"warn"`):
- `@typescript-eslint/no-explicit-any`
- `@typescript-eslint/no-non-null-assertion`
- `@typescript-eslint/explicit-function-return-type` (on exported functions)
- `no-console`
- `no-unused-vars`
- `eqeqeq`

---

## Tests are first-class code

Test code follows every standard above — no exceptions:
- Test files are named, structured, and linted identically to production files
- Test helper functions follow the same naming and length rules
- No `any` in test code
- No magic strings in assertions — extract expected values to named constants
- No `test.only` or `test.skip` in committed code
- No `// @ts-ignore` to make a test compile

---

## Documentation

Do **not** write comments that restate what the code does. The only acceptable comments are:

1. A non-obvious business rule or regulatory constraint that the code encodes:
   ```ts
   // CERT-In 2022: audit logs must be retained for 180 days minimum
   const AUDIT_RETENTION_DAYS = 180;
   ```

2. A workaround for a known external bug or limitation, with a link:
   ```ts
   // MUI v5 DataGrid doesn't expose row density via sx — override via global class
   ```

3. A security invariant that must not be broken:
   ```ts
   // Never pass the raw PAN to this function — always pass the masked form
   ```

Public API functions (exported service methods, utility functions) get a single-line JSDoc summary only if the name alone is not self-documenting. No `@param` or `@returns` tags for typed TypeScript — the types are the documentation.

---

## Commit message format — commitlint

All commit messages must follow the **Conventional Commits** specification, enforced by `commitlint` in the `commit-msg` git hook.

**Format:** `type(scope): description`

```
feat(pan): add PAN registration endpoint
fix(auth): correct JWT expiry calculation
test(cards): add branch coverage for zero credit limit
refactor(db): extract query builder from route handler
docs(api): update credit-cards response contract
chore(deps): bump @mui/material to v5.15.0
perf(overview): cache aggregated totals per PAN
ci(coverage): enforce 100% threshold in pipeline
```

**Allowed types:**

| Type | When to use |
|---|---|
| `feat` | New feature visible to users or API consumers |
| `fix` | Bug fix |
| `refactor` | Code restructuring — no behaviour change |
| `test` | Adding or correcting tests only |
| `perf` | Performance improvement |
| `docs` | Documentation only |
| `chore` | Tooling, deps, config — nothing that affects runtime |
| `ci` | CI/CD pipeline changes |
| `build` | Build system changes (Dockerfile, Vite config) |
| `revert` | Reverts a previous commit |

**Allowed scopes** (optional, use when relevant):
`pan`, `auth`, `cards`, `accounts`, `loans`, `investments`, `insurance`, `overview`, `db`, `migration`, `web`, `api`, `docker`, `deps`

**Rules:**
- Description is lowercase, imperative mood, no trailing period
- Body (optional) explains *why*, not *what*
- Footer references ticket: `Refs: #42` or `BREAKING CHANGE: <detail>`
- Commits that only touch test files must use `test` type — not `feat` or `fix`

**Install:**
```bash
npm install -D @commitlint/cli @commitlint/config-conventional
```

`commitlint.config.ts` (repo root):
```ts
import type { UserConfig } from '@commitlint/types';

const config: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      ['pan','auth','cards','accounts','loans','investments',
       'insurance','overview','db','migration','web','api','docker','deps'],
    ],
    'subject-case': [2, 'always', 'lower-case'],
    'subject-max-length': [2, 'always', 100],
    'body-max-line-length': [2, 'always', 120],
  },
};

export default config;
```

---

## Pre-commit gate — husky hooks

Install husky at the repo root:
```bash
npm install -D husky
npx husky init
```

### Hook 1 — `.husky/commit-msg` (validates commit message format)

```bash
#!/usr/bin/env sh
npx --no -- commitlint --edit "$1"
```

This hook runs `commitlint` against the message every developer types. A malformed message aborts the commit immediately with a clear error — before any tests run.

### Hook 2 — `.husky/pre-commit` (code quality + coverage gate)

```bash
#!/usr/bin/env sh

set -e   # abort on first failure

echo "▶ Type check"
npx tsc --noEmit

echo "▶ Lint"
npx eslint . --max-warnings 0

echo "▶ Format"
npx prettier --check .

echo "▶ Frontend tests (80% coverage gate)"
cd apps/web && npx vitest run --coverage
cd ../..

echo "▶ Backend tests (80% coverage gate)"
cd apps/api && npx jest --coverage
```

**Coverage policy — two tiers:**

| Gate | Threshold | Enforced by |
|---|---|---|
| **Commit** (local, fast feedback) | **80 %** | `.husky/pre-commit` using local config |
| **CI / merge** (PR cannot merge) | **80 %** | Pipeline using the same `vite.config.ts` / `jest.config.ts` |

Both gates use the same 80 % threshold — there is no stricter CI variant. Both apply to lines, branches, functions, and statements.

**Never bypass with `--no-verify`.** If hooks are failing, fix the underlying issue — do not skip the gate.

### `package.json` prepare script

Ensures husky installs automatically for every developer after `npm install`:
```json
{
  "scripts": {
    "prepare": "husky"
  }
}
```
