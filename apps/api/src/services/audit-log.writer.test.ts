const mockLogger = { error: jest.fn() };
jest.mock('pino', () => jest.fn(() => mockLogger));

import { writeAuditLog } from './audit-log.writer';

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
});
