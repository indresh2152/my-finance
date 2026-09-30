import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { vi } from 'vitest';
import { listEmailAccounts, type EmailAccount } from './accounts.api';

vi.mock('./navigation', () => ({ redirectTo: vi.fn() }));

const account: EmailAccount = {
  id: 'acc-1',
  bankName: 'ICICI',
  accountNumberLast4: '5678',
  accountType: 'SAVINGS',
  availableBalance: 234567.89,
  balanceAsOf: '2026-09-24T10:12:00.000Z',
};

const server = setupServer(
  http.get('/api/v1/mailboxes/accounts', () => HttpResponse.json({ data: [account] })),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('listEmailAccounts', () => {
  it('should return the accounts from the data field', async () => {
    await expect(listEmailAccounts()).resolves.toEqual([account]);
  });
});
