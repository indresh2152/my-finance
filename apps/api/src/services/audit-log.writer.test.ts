const mockLogger = { error: jest.fn() };
jest.mock('pino', () => jest.fn(() => mockLogger));

import { Writable } from 'stream';
import { writeAuditLog } from './audit-log.writer';
import { errorLoggerOptions } from '../middleware/error.middleware';

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

  it('should redact pg error detail/where when logging a failed insert (same rules as error.middleware)', () => {
    const realPino = jest.requireActual<typeof import('pino')>('pino');
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _encoding, callback): void {
        lines.push(chunk.toString());
        callback();
      },
    });
    const auditWriterLogger = realPino({ ...errorLoggerOptions, name: 'audit-writer' }, sink);
    const pgError = Object.assign(new Error('duplicate key'), {
      code: '23505',
      detail: 'Key (pan_hash)=(secret-hash) already exists.',
      where: 'SQL statement',
    });

    auditWriterLogger.error({ err: pgError, action: 'MAILBOX_SYNC' }, 'audit write failed');

    const logged = lines.join('');
    expect(logged).not.toContain('secret-hash');
    expect(logged).toContain('[redacted]');
    expect(logged).toContain('"name":"audit-writer"');
  });
});
