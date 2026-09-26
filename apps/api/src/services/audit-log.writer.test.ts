const mockLogger = { error: jest.fn() };
const mockPino = jest.fn((..._args: unknown[]) => mockLogger);
jest.mock('pino', () => mockPino);

import { writeAuditLog } from './audit-log.writer';
import { errorLoggerOptions } from '../middleware/error.middleware';

// The writer's module-level `pino(...)` call happens once, at import time above (alongside an
// unrelated `pino(errorLoggerOptions)` call inside error.middleware.ts, which audit-log.writer.ts
// itself imports) — find it by its logger `name` now, before any `clearAllMocks()` in `afterEach`
// wipes `mockPino`'s call history.
const loggerConstructorArgs: unknown = mockPino.mock.calls.find(
  (call) => (call[0] as { name?: unknown } | undefined)?.name === 'audit-writer',
)?.[0];

afterEach(() => jest.clearAllMocks());

describe('writeAuditLog', () => {
  it('should insert an audit row with serialised metadata', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await writeAuditLog(db, {
      userId: 'user-1',
      action: 'MAILBOX_LINK',
      resourceType: 'mail_connection',
      resourceId: 'mb-1',
      ipAddress: '127.0.0.1',
      metadata: { provider: 'GOOGLE' },
    });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_logs'), [
      'user-1',
      'MAILBOX_LINK',
      'mail_connection',
      'mb-1',
      '127.0.0.1',
      '{"provider":"GOOGLE"}',
    ]);
  });

  it('should default optional fields to null', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await writeAuditLog(db, { userId: null, action: 'MAILBOX_SYNC' });
    expect(db.query).toHaveBeenCalledWith(expect.any(String), [
      null,
      'MAILBOX_SYNC',
      null,
      null,
      null,
      null,
    ]);
  });

  it('should log and swallow database errors', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('db down')) };
    await expect(
      writeAuditLog(db, { userId: 'u', action: 'MAILBOX_UNLINK' }),
    ).resolves.toBeUndefined();
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('should construct its logger with the shared redaction rules and its own name', () => {
    // Proves the writer actually passes `errorLoggerOptions` (which error.middleware.test.ts
    // proves redacts err.detail/where/internalQuery) into its own pino instance: deleting the
    // `...errorLoggerOptions` spread from audit-log.writer.ts fails this assertion.
    expect(loggerConstructorArgs).toMatchObject({
      name: 'audit-writer',
      redact: errorLoggerOptions.redact,
    });
  });
});
