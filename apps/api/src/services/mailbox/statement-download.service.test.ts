import { StatementDownloadService } from './statement-download.service';
import { ProviderNotFoundError, ReauthRequiredError } from './providers/mail-provider';
import type { MailProvider } from './providers/mail-provider';
import { encrypt } from '../../utils/crypto.utils';
import {
  CTX,
  PAN,
  makeDb,
  makeProvider,
  paramsWhere,
  sqlOf,
  ring,
  type MockDb,
  type Rows,
} from '../../test/mailbox-service.fixtures';

const STATEMENT_ID = 'stmt-1';
const PDF_BYTES = Buffer.from('%PDF-1.7 statement');

const statementRow = (overrides: Record<string, unknown> = {}): Rows[number] => ({
  source_message_id: 'msg-1',
  attachment_locator: 'att-1',
  attachment_filename: 'HDFC_Statement.pdf',
  mailbox_id: 'mb-1',
  provider: 'GOOGLE',
  status: 'ACTIVE',
  credential_enc: encrypt('refresh-1', ring),
  ...overrides,
});

interface Setup {
  readonly service: StatementDownloadService;
  readonly db: MockDb;
  readonly provider: jest.Mocked<MailProvider>;
}

const setup = (rows: Rows, overrides: Partial<MailProvider> = {}): Setup => {
  const db = makeDb([PAN, ['FROM card_statements', rows]]);
  const provider = makeProvider({
    getAccessToken: jest.fn().mockResolvedValue({ accessToken: 'at', rotatedRefreshToken: null }),
    getAttachment: jest.fn().mockResolvedValue(PDF_BYTES),
    ...overrides,
  });
  const service = new StatementDownloadService({
    db: db as never,
    keyRing: ring,
    providers: new Map([['GOOGLE', provider]]),
  });
  return { service, db, provider };
};

const auditCall = (db: MockDb): unknown[] | undefined =>
  db.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO audit_logs'))?.[1];

describe('StatementDownloadService.download', () => {
  it('should fetch the attachment from the mailbox that received the statement', async () => {
    const { service, db, provider } = setup([statementRow()]);

    const file = await service.download(CTX, STATEMENT_ID);

    expect(file).toEqual({
      content: PDF_BYTES,
      filename: 'HDFC_Statement.pdf',
      contentType: 'application/pdf',
    });
    expect(provider.getAccessToken).toHaveBeenCalledWith('refresh-1');
    expect(provider.getAttachment).toHaveBeenCalledWith('at', 'msg-1', 'att-1');
    const lookupSql = sqlOf(db.query).find((sql) => sql.includes('FROM card_statements'));
    expect(lookupSql).toContain('c.pan_profile_id = $2');
    expect(lookupSql).toContain('mc.user_id = $3');
    expect(paramsWhere(db.query, 'FROM card_statements')).toEqual([
      STATEMENT_ID,
      'pan-1',
      'user-1',
    ]);
    expect(auditCall(db)).toEqual(
      expect.arrayContaining(['user-1', 'STATEMENT_DOWNLOAD', 'card_statement', STATEMENT_ID]),
    );
  });

  it('should label bytes that are not a PDF as a generic binary file', async () => {
    const { service } = setup([statementRow()], {
      getAttachment: jest.fn().mockResolvedValue(Buffer.from('<html>')),
    });
    await expect(service.download(CTX, STATEMENT_ID)).resolves.toMatchObject({
      contentType: 'application/octet-stream',
    });
  });

  it('should use a default filename when the email gave none', async () => {
    const { service } = setup([statementRow({ attachment_filename: null })]);
    await expect(service.download(CTX, STATEMENT_ID)).resolves.toMatchObject({
      filename: 'statement.pdf',
    });
  });

  it('should require a registered PAN', async () => {
    const db = makeDb([]);
    const service = new StatementDownloadService({
      db: db as never,
      keyRing: ring,
      providers: new Map(),
    });
    await expect(service.download(CTX, STATEMENT_ID)).rejects.toMatchObject({
      code: 'PAN_NOT_REGISTERED',
    });
  });

  it('should return 404 STATEMENT_NOT_FOUND for a statement the user does not own', async () => {
    const { service, db } = setup([]);
    await expect(service.download(CTX, STATEMENT_ID)).rejects.toMatchObject({
      code: 'STATEMENT_NOT_FOUND',
      status: 404,
    });
    expect(auditCall(db)).toBeUndefined();
  });

  it('should return 404 STATEMENT_UNAVAILABLE when the email had no PDF', async () => {
    const { service, provider } = setup([statementRow({ attachment_locator: null })]);
    await expect(service.download(CTX, STATEMENT_ID)).rejects.toMatchObject({
      code: 'STATEMENT_UNAVAILABLE',
      status: 404,
    });
    expect(provider.getAccessToken).not.toHaveBeenCalled();
  });

  it('should return 404 STATEMENT_UNAVAILABLE when the email or attachment is gone', async () => {
    const { service } = setup([statementRow()], {
      getAttachment: jest.fn().mockRejectedValue(new ProviderNotFoundError('GOOGLE')),
    });
    await expect(service.download(CTX, STATEMENT_ID)).rejects.toMatchObject({
      code: 'STATEMENT_UNAVAILABLE',
    });
  });

  it('should return 404 STATEMENT_UNAVAILABLE when the provider is not configured here', async () => {
    const { service } = setup([statementRow({ provider: 'MICROSOFT' })]);
    await expect(service.download(CTX, STATEMENT_ID)).rejects.toMatchObject({
      code: 'STATEMENT_UNAVAILABLE',
    });
  });

  it('should return 409 MAILBOX_REAUTH_REQUIRED for a mailbox whose access expired', async () => {
    const { service, provider } = setup([statementRow({ status: 'REAUTH_REQUIRED' })]);
    await expect(service.download(CTX, STATEMENT_ID)).rejects.toMatchObject({
      code: 'MAILBOX_REAUTH_REQUIRED',
      status: 409,
    });
    expect(provider.getAccessToken).not.toHaveBeenCalled();
  });

  it('should park the mailbox and return 409 when the provider rejects the grant', async () => {
    const { service, db } = setup([statementRow()], {
      getAccessToken: jest.fn().mockRejectedValue(new ReauthRequiredError('GOOGLE')),
    });
    await expect(service.download(CTX, STATEMENT_ID)).rejects.toMatchObject({
      code: 'MAILBOX_REAUTH_REQUIRED',
    });
    expect(paramsWhere(db.query, "status = 'REAUTH_REQUIRED'")).toEqual(['mb-1']);
  });

  it('should rethrow other provider failures', async () => {
    const { service } = setup([statementRow()], {
      getAttachment: jest.fn().mockRejectedValue(new Error('boom')),
    });
    await expect(service.download(CTX, STATEMENT_ID)).rejects.toThrow('boom');
  });
});
