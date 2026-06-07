---
name: frontend-testing
description: Frontend unit testing with Vitest + React Testing Library — 80% coverage required at commit and in CI
---

> **Runner: Vitest — `apps/web` only.**
> Do NOT use Jest here. Mock/spy with `vi.*`, not `jest.*`. Config lives in `vite.config.ts`, not `jest.config.ts`.

**Trigger:** Any time frontend code is written or modified in `apps/web/`. Tests are written in the same session as the code — never deferred.

## Coverage policy

**Threshold: 80 %** — enforced identically at commit time (pre-commit hook) and in CI (PR merge gate). Applies to lines, branches, functions, and statements.

No coverage exclusion comments are permitted (`/* c8 ignore */`, `/* istanbul ignore */`) without documented approval in `docs/design/testing-strategy.md`.

## Stack

```bash
# Install once
npm install -D vitest @vitest/coverage-v8 @testing-library/react \
  @testing-library/user-event @testing-library/jest-dom \
  msw jsdom
```

**`vite.config.ts`** — single config used by both the pre-commit hook and CI:
```ts
test: {
  environment: 'jsdom',
  globals: true,
  setupFiles: ['./src/test/setup.ts'],
  coverage: {
    provider: 'v8',
    reporter: ['text', 'lcov', 'html'],
    thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
    exclude: ['src/test/**', 'src/main.tsx', 'src/**/*.d.ts'],
  },
},
```

`src/test/setup.ts`:
```ts
import '@testing-library/jest-dom';
```

## File placement

Tests live **next to the source file** — never in a separate `__tests__/` tree:
```
src/
  components/
    CreditCardList/
      CreditCardList.tsx
      CreditCardList.test.tsx   ← co-located
  hooks/
    useFormatCurrency.ts
    useFormatCurrency.test.ts
  utils/
    pan.ts
    pan.test.ts
```

## Naming convention

```ts
describe('CreditCardList', () => {
  it('should render a card row for each item in the list', () => { ... });
  it('should show the empty-state alert when the list is empty', () => { ... });
  it('should display credit limit formatted in en-IN locale', () => { ... });
});
```

Pattern: `should <expected behaviour> when <condition>` — omit "when" clause only when the condition is the default/only state.

## Test structure (AAA)

```ts
it('should mask PAN digits in the display', () => {
  // Arrange
  const pan = 'ABCDE1234F';

  // Act
  const masked = maskPan(pan);

  // Assert
  expect(masked).toBe('ABCDE####F');
});
```

Keep Arrange, Act, Assert clearly separated. One logical assertion per test (multiple `expect` calls are fine if they describe the same outcome).

## Component tests

Always render with the full provider tree the component needs:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@mui/material/styles';
import { theme } from '../../theme';

const renderWithProviders = (ui: React.ReactElement, { initialEntries = ['/'] } = {}) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },  // no retries in tests
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <ThemeProvider theme={theme}>{ui}</ThemeProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

it('should display the card network badge', () => {
  renderWithProviders(<CreditCardRow card={mockCard} />);
  expect(screen.getByText('VISA')).toBeInTheDocument();
});
```

A fresh `QueryClient` per test prevents cached data leaking between tests. Pass `initialEntries` when testing route-dependent behavior (e.g., components that read `useParams`).

Query priority (RTL best practice — highest to lowest):
1. `getByRole` — accessible role + name
2. `getByLabelText` — form fields
3. `getByPlaceholderText` — fallback for inputs
4. `getByText` — visible text
5. `getByTestId` — last resort; always prefer semantic queries

Never use `container.querySelector`. Never assert on class names or inline styles.

## API mocking with MSW

Use Mock Service Worker to intercept `fetch` — never mock the fetch module itself:
```ts
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const server = setupServer(
  http.get('/api/v1/credit-cards', () =>
    HttpResponse.json({ cards: [mockCard] })
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

Test error states explicitly by overriding the handler in that test:
```ts
it('should show error alert when API returns 500', async () => {
  server.use(http.get('/api/v1/credit-cards', () => new HttpResponse(null, { status: 500 })));
  // ...
});
```

## Custom hooks

Use `renderHook` from RTL:
```ts
import { renderHook, act } from '@testing-library/react';

it('should return formatted INR string', () => {
  const { result } = renderHook(() => useFormatCurrency());
  expect(result.current.format(500000)).toBe('₹5,00,000.00');
});
```

## Utility / pure function tests

Pure functions get plain unit tests — no rendering needed:
```ts
import { validatePan, maskPan } from './pan';

describe('validatePan', () => {
  it('should return true for a valid PAN', () => {
    expect(validatePan('ABCDE1234F')).toBe(true);
  });
  it('should return false for lowercase input', () => {
    expect(validatePan('abcde1234f')).toBe(false);
  });
  it('should return false for PAN shorter than 10 characters', () => {
    expect(validatePan('ABCDE123')).toBe(false);
  });
});
```

Test boundary values, invalid inputs, and all branches — not just the happy path.

## Running tests

```bash
# Watch mode during development
cd apps/web && npx vitest

# Single run + coverage (80% gate — same threshold locally and in CI)
cd apps/web && npx vitest run --coverage

# Browse uncovered lines after a run
open coverage/index.html
```

## Verify after every code change

**Before claiming any change is complete**, run the full test suite and confirm all three:

```bash
cd apps/web && npx vitest run --coverage
```

1. Exit code 0 — no failing tests
2. Coverage table shows ≥ 80 % for lines, branches, functions, statements
3. No new skipped or `.only` tests in the output

Do not move on to the next task while tests are red or coverage is below threshold.

## Vitest globals — `vi.*` not `jest.*`

This project uses **Vitest**, not Jest. The test runner globals are different:

| What you need | Vitest (correct) | Jest (wrong — will throw `jest is not defined`) |
|---|---|---|
| Spy on a method | `vi.spyOn(obj, 'method')` | `jest.spyOn(…)` |
| Stub a function | `vi.fn()` | `jest.fn()` |
| Mock a module | `vi.mock('../module')` | `jest.mock(…)` |
| Fake timers | `vi.useFakeTimers()` | `jest.useFakeTimers()` |
| Advance timers | `vi.advanceTimersByTime(ms)` | `jest.advanceTimersByTime(ms)` |
| Reset mocks | `vi.clearAllMocks()` | `jest.clearAllMocks()` |

Import `vi` explicitly at the top of every test file that uses it:
```ts
import { vi } from 'vitest';
```

`vi` is also available as a global when `globals: true` is set in `vite.config.ts`, but importing it explicitly makes the dependency clear and avoids editor warnings.

**Common mistake**: copying examples from Jest documentation or older code will silently fail with `ReferenceError: jest is not defined`. Always check that spy/mock calls use `vi.*`.

## What NOT to mock

- Do not mock MUI components — they must render correctly
- Do not mock React Router's `useNavigate` by default — use `MemoryRouter` instead
- Do not mock the theme — always wrap with the real `ThemeProvider`
- Do mock: external HTTP calls (via MSW), browser APIs (`localStorage`, `matchMedia`)
