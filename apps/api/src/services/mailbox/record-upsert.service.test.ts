import { RecordUpsertService, fitFilename } from './record-upsert.service';
import type { CardStatementResult } from '../../parsers/email-parser';

interface MockClient {
  query: jest.Mock;
  release: jest.Mock;
}

const makePool = (): { pool: { connect: jest.Mock }; client: MockClient } => {
  const client: MockClient = {
    query: jest.fn().mockResolvedValue({ rows: [{ id: 'row-id' }] }),
    release: jest.fn(),
  };
  return { pool: { connect: jest.fn().mockResolvedValue(client) }, client };
};

const statement: CardStatementResult = {
  kind: 'CARD_STATEMENT',
  issuingBank: 'HDFC',
  last4: '1234',
  statementDate: '2026-09-05',
  dueDate: '2026-09-25',
  totalDue: 12345.67,
  minDue: 620,
  passwordHint: 'First 4 letters of name + DDMM',
  attachment: { locator: '1', filename: 'stmt.pdf' },
};

const sqlCalls = (client: MockClient): string[] =>
  client.query.mock.calls.map((call) => call[0] as string);

/** The params passed to `client.query` at `index`, throwing (rather than asserting with `!`) when missing. */
const paramsAt = (client: MockClient, index: number): unknown => {
  const call = client.query.mock.calls[index] as [string, unknown?] | undefined;
  if (!call) throw new Error(`query call ${index} was not recorded`);
  return call[1];
};

describe('RecordUpsertService.apply', () => {
  it('should upsert an EMAIL card and its statement in one transaction', async () => {
    const { pool, client } = makePool();
    await new RecordUpsertService(pool as never).apply('pan-1', 'mb-1', statement, 'msg-1');

    const sql = sqlCalls(client);
    expect(sql[0]).toBe('BEGIN');
    expect(sql[1]).toContain('INSERT INTO credit_cards');
    expect(sql[1]).toContain('ON CONFLICT (pan_profile_id, issuing_bank, card_number_last4)');
    expect(sql[1]).toContain("WHERE source = 'EMAIL' AND card_number_last4 IS NOT NULL");
    expect(paramsAt(client, 1)).toEqual(['pan-1', '1234', null, 'HDFC', 5]);
    expect(sql[2]).toContain('INSERT INTO card_statements');
    expect(paramsAt(client, 2)).toEqual([
      'row-id',
      'mb-1',
      '2026-09-05',
      '2026-09-25',
      12345.67,
      620,
      'First 4 letters of name + DDMM',
      'msg-1',
      '1',
      'stmt.pdf',
    ]);
    expect(sql[3]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  describe('a card known only by name', () => {
    const named: CardStatementResult = {
      ...statement,
      last4: undefined,
      cardName: 'Scapia',
      statementDate: '2026-09-25',
    };

    /** A pool whose name lookup returns `existing`; every other query returns a new row's id. */
    const poolWithNamedCards = (
      existing: { id: string; billing_cycle_day: number | null }[],
    ): ReturnType<typeof makePool> => {
      const made = makePool();
      made.client.query.mockImplementation((sql: string) =>
        Promise.resolve({
          rows: sql.startsWith('SELECT id, billing_cycle_day') ? existing : [{ id: 'new-card' }],
        }),
      );
      return made;
    };

    it('should lock the PAN, bank and name before looking up same-named cards', async () => {
      const { pool, client } = poolWithNamedCards([]);
      await new RecordUpsertService(pool as never).apply('pan-1', 'mb-1', named, 'msg-1');
      const sql = sqlCalls(client);
      expect(sql[1]).toContain('pg_advisory_xact_lock');
      expect(paramsAt(client, 1)).toEqual(['pan-1', 'HDFC', 'Scapia']);
      expect(sql[2]).toContain('card_number_last4 IS NULL');
      expect(paramsAt(client, 2)).toEqual(['pan-1', 'HDFC', 'Scapia']);
    });

    it('should add the statement to the same-named card with the same statement day', async () => {
      const { pool, client } = poolWithNamedCards([
        { id: 'card-14', billing_cycle_day: 14 },
        { id: 'card-25', billing_cycle_day: 25 },
      ]);
      await new RecordUpsertService(pool as never).apply('pan-1', 'mb-1', named, 'msg-1');
      const sql = sqlCalls(client);
      expect(sql.some((q) => q.startsWith('INSERT INTO credit_cards'))).toBe(false);
      expect(sql[3]).toContain('INSERT INTO card_statements');
      expect(paramsAt(client, 3)).toEqual(
        expect.arrayContaining(['card-25', 'mb-1', '2026-09-25']),
      );
    });

    it('should add a new card when no same-named card has that statement day', async () => {
      const { pool, client } = poolWithNamedCards([{ id: 'card-14', billing_cycle_day: 14 }]);
      await new RecordUpsertService(pool as never).apply('pan-1', 'mb-1', named, 'msg-1');
      const sql = sqlCalls(client);
      expect(sql[3]).toContain('INSERT INTO credit_cards');
      expect(paramsAt(client, 3)).toEqual(['pan-1', null, 'Scapia', 'HDFC', 25]);
      expect(paramsAt(client, 4)).toEqual(
        expect.arrayContaining(['new-card', 'mb-1', '2026-09-25']),
      );
    });
  });

  it('should store no due date when nothing is due', async () => {
    const { pool, client } = makePool();
    const nothingDue = { ...statement, dueDate: undefined, totalDue: 0 };
    await new RecordUpsertService(pool as never).apply('pan-1', 'mb-1', nothingDue, 'msg-1');
    expect(paramsAt(client, 2)).toEqual(
      expect.arrayContaining(['row-id', 'mb-1', '2026-09-05', null, 0]),
    );
  });

  it('should store nulls for optional statement fields', async () => {
    const { pool, client } = makePool();
    const minimal: CardStatementResult = {
      ...statement,
      minDue: undefined,
      passwordHint: undefined,
      attachment: undefined,
    };
    await new RecordUpsertService(pool as never).apply('pan-1', 'mb-1', minimal, 'msg-1');
    expect(paramsAt(client, 2)).toEqual([
      'row-id',
      'mb-1',
      '2026-09-05',
      '2026-09-25',
      12345.67,
      null,
      null,
      'msg-1',
      null,
      null,
    ]);
  });

  it('should roll back and release on failure', async () => {
    const { pool, client } = makePool();
    client.query.mockImplementation((sql: string) =>
      sql.startsWith('INSERT INTO card_statements')
        ? Promise.reject(new Error('boom'))
        : Promise.resolve({ rows: [{ id: 'row-id' }] }),
    );
    await expect(
      new RecordUpsertService(pool as never).apply('pan-1', 'mb-1', statement, 'msg-1'),
    ).rejects.toThrow('boom');
    expect(sqlCalls(client)).toContain('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  it('should still surface the original error (not a rollback error) when ROLLBACK itself fails', async () => {
    const { pool, client } = makePool();
    client.query.mockImplementation((sql: string) => {
      if (sql.startsWith('INSERT INTO card_statements')) return Promise.reject(new Error('boom'));
      if (sql === 'ROLLBACK') return Promise.reject(new Error('rollback also failed'));
      return Promise.resolve({ rows: [{ id: 'row-id' }] });
    });
    await expect(
      new RecordUpsertService(pool as never).apply('pan-1', 'mb-1', statement, 'msg-1'),
    ).rejects.toThrow('boom');
    expect(client.release).toHaveBeenCalled();
  });
});

describe('fitFilename', () => {
  it('should keep a name that fits', () => {
    expect(fitFilename('statement.pdf')).toBe('statement.pdf');
  });

  it('should shorten an overlong name to 255 characters, keeping the extension', () => {
    const fitted = fitFilename(`${'s'.repeat(300)}.pdf`);
    expect(fitted).toHaveLength(255);
    expect(fitted.endsWith('.pdf')).toBe(true);
  });
});
