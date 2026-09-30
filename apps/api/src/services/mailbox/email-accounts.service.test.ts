import { EmailAccountsService } from './email-accounts.service';

const CTX = { userId: 'user-1', lng: 'en', ip: '203.0.113.7' };
const ACCOUNT_ROW = {
  id: 'acc-1',
  bank_name: 'ICICI',
  account_number_last4: '5678',
  account_type: 'SAVINGS',
  available_balance: '234567.89',
  balance_as_of: new Date('2026-09-24T10:12:00Z'),
};

const makeDb = (panRows: unknown[], accountRows: unknown[] = []): { query: jest.Mock } => ({
  query: jest
    .fn()
    .mockResolvedValueOnce({ rows: panRows })
    .mockResolvedValueOnce({ rows: accountRows })
    .mockResolvedValue({ rows: [] }),
});

describe('EmailAccountsService.list', () => {
  it('should return each account with its latest balance as numbers and ISO dates', async () => {
    const db = makeDb([{ id: 'pan-1' }], [ACCOUNT_ROW]);
    await expect(new EmailAccountsService(db as never).list(CTX)).resolves.toEqual([
      {
        id: 'acc-1',
        bankName: 'ICICI',
        accountNumberLast4: '5678',
        accountType: 'SAVINGS',
        availableBalance: 234567.89,
        balanceAsOf: '2026-09-24T10:12:00.000Z',
      },
    ]);
    const [sql, params] = db.query.mock.calls[1] as [string, unknown[]];
    expect(params).toEqual(['pan-1']);
    expect(sql).toMatch(/source = 'EMAIL'/);
    expect(sql).toMatch(/ORDER BY balance_as_of DESC/);
  });

  it('should audit the listing with the count only', async () => {
    const db = makeDb([{ id: 'pan-1' }], [ACCOUNT_ROW]);
    await new EmailAccountsService(db as never).list(CTX);
    const [sql, params] = db.query.mock.calls[2] as [string, unknown[]];
    expect(sql).toMatch(/INSERT INTO audit_logs/);
    expect(params).toEqual([
      'user-1',
      'EMAIL_ACCOUNT_LIST',
      'bank_account',
      null,
      '203.0.113.7',
      JSON.stringify({ count: 1 }),
    ]);
  });

  it('should reject a user without a PAN', async () => {
    const db = makeDb([]);
    await expect(new EmailAccountsService(db as never).list(CTX)).rejects.toMatchObject({
      code: 'PAN_NOT_REGISTERED',
      status: 403,
    });
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});
