const mockLogger = { warn: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('pino', () => jest.fn(() => mockLogger));

import {
  build,
  connectionRow,
  makeDb,
  makeProvider,
  refs,
} from '../../test/mail-sync-service.fixtures';
import { paramsWhere } from '../../test/mailbox-service.fixtures';

const FAILED = "last_sync_status = 'FAILED'";
const SECRET_MESSAGE = 'value 99999999.99 out of range for card 4321';
const SECRET_DETAIL = 'Failing row contains (4321, hint: DOB)';

const pgError = (code: string): Error =>
  Object.assign(new Error(SECRET_MESSAGE), { code, detail: SECRET_DETAIL });

afterEach(() => jest.clearAllMocks());

describe('MailSyncService.syncMailbox with records the database rejects', () => {
  it('should skip a class-22 data exception, log it without the error, and continue the run', async () => {
    const provider = makeProvider({ search: jest.fn(refs('m1', 'm2')) });
    const { service, upserts } = build(makeDb(connectionRow()), provider);
    upserts.apply.mockRejectedValueOnce(pgError('22003'));

    await expect(service.syncMailbox('mb-1')).resolves.toEqual({
      scanned: 2,
      parsed: 1,
      skipped: 1,
      noParser: 0,
      fieldsMissing: {},
    });
    expect(upserts.apply).toHaveBeenCalledTimes(2);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { parserKey: 'hdfc.cc-statement', messageId: 'm1', errName: 'Error', code: '22003' },
      expect.any(String),
    );
    const logged = JSON.stringify(mockLogger.warn.mock.calls);
    expect(logged).not.toContain('4321');
    expect(logged).not.toContain('DOB');
  });

  it('should skip a class-23 integrity violation', async () => {
    const provider = makeProvider({ search: jest.fn(refs('m1')) });
    const { service, upserts } = build(makeDb(connectionRow()), provider);
    upserts.apply.mockRejectedValueOnce(pgError('23514'));
    await expect(service.syncMailbox('mb-1')).resolves.toEqual({
      scanned: 1,
      parsed: 0,
      skipped: 1,
      noParser: 0,
      fieldsMissing: {},
    });
  });

  it('should fail the run on a foreign-key violation (23503)', async () => {
    const provider = makeProvider({ search: jest.fn(refs('m1')) });
    const db = makeDb(connectionRow());
    const { service, upserts } = build(db, provider);
    upserts.apply.mockRejectedValueOnce(pgError('23503'));
    await expect(service.syncMailbox('mb-1')).rejects.toMatchObject({ code: '23503' });
    expect(paramsWhere(db.query, FAILED)).toEqual(['mb-1', 'SYNC_ERROR']);
  });

  it('should fail the run on a non-pg error', async () => {
    const provider = makeProvider({ search: jest.fn(refs('m1', 'm2')) });
    const db = makeDb(connectionRow());
    const { service, upserts } = build(db, provider);
    upserts.apply.mockRejectedValueOnce(new Error('connection terminated'));
    await expect(service.syncMailbox('mb-1')).rejects.toThrow('connection terminated');
    expect(upserts.apply).toHaveBeenCalledTimes(1);
    expect(paramsWhere(db.query, FAILED)).toEqual(['mb-1', 'SYNC_ERROR']);
  });
});
