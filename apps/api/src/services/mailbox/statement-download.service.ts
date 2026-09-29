import type { Pool } from 'pg';
import { AppError } from '../../middleware/error.middleware';
import { i18next } from '../../i18n';
import { writeAuditLog } from '../audit-log.writer';
import { requirePanProfileId } from '../pan-profile.lookup';
import type { KeyRing } from '../../utils/crypto.utils';
import { mailboxReauthRequired, markReauthRequired, obtainAccess } from './mailbox-access';
import type { ProviderRegistry } from './providers';
import {
  ProviderNotFoundError,
  ReauthRequiredError,
  type ProviderKey,
} from './providers/mail-provider';
import type { MailboxStatus, RequestContext } from './mailbox.types';

const HTTP_NOT_FOUND = 404;
const RESOURCE_TYPE = 'card_statement';
const DEFAULT_FILENAME = 'statement.pdf';
const PDF_MIME_TYPE = 'application/pdf';
const BINARY_MIME_TYPE = 'application/octet-stream';
const PDF_SIGNATURE = Buffer.from('%PDF-');

/** Scoped by PAN profile and mailbox owner: another user's statement id is simply not found. */
const FIND_STATEMENT_SQL = `SELECT s.source_message_id, s.attachment_locator, s.attachment_filename,
          mc.id AS mailbox_id, mc.provider, mc.status, mc.credential_enc
   FROM card_statements s
   JOIN credit_cards c ON c.id = s.credit_card_id
   JOIN mail_connections mc ON mc.id = s.mail_connection_id
   WHERE s.id = $1 AND c.pan_profile_id = $2 AND mc.user_id = $3`;

interface StatementRow {
  readonly source_message_id: string;
  readonly attachment_locator: string | null;
  readonly attachment_filename: string | null;
  readonly mailbox_id: string;
  readonly provider: ProviderKey;
  readonly status: MailboxStatus;
  readonly credential_enc: Buffer;
}

export interface StatementFile {
  readonly content: Buffer;
  /** From the bank email, so untrusted: the route must encode it safely. */
  readonly filename: string;
  readonly contentType: string;
}

export interface StatementDownloadDeps {
  readonly db: Pick<Pool, 'query'>;
  readonly providers: ProviderRegistry;
  readonly keyRing: KeyRing;
}

/** Only real PDF bytes are labelled as a PDF; anything else downloads as opaque bytes. */
const contentTypeOf = (content: Buffer): string =>
  content.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE)
    ? PDF_MIME_TYPE
    : BINARY_MIME_TYPE;

const appError = (ctx: RequestContext, code: string, key: string, status: number): AppError =>
  new AppError(code, status, i18next.t(key, { lng: ctx.lng }));

const unavailable = (ctx: RequestContext): AppError =>
  appError(ctx, 'STATEMENT_UNAVAILABLE', 'error.statement_unavailable', HTTP_NOT_FOUND);

export class StatementDownloadService {
  constructor(private readonly deps: StatementDownloadDeps) {}

  /** Fetches the statement file live from the mailbox that received it; nothing is stored. */
  async download(ctx: RequestContext, statementId: string): Promise<StatementFile> {
    const panProfileId = await requirePanProfileId(this.deps.db, ctx.userId, ctx.lng);
    const { rows } = await this.deps.db.query<StatementRow>(FIND_STATEMENT_SQL, [
      statementId,
      panProfileId,
      ctx.userId,
    ]);
    const row = rows[0];
    if (!row) {
      throw appError(ctx, 'STATEMENT_NOT_FOUND', 'error.statement_not_found', HTTP_NOT_FOUND);
    }
    if (row.status === 'REAUTH_REQUIRED') throw mailboxReauthRequired(ctx.lng);

    const content = await this.fetchAttachment(ctx, row);
    await writeAuditLog(this.deps.db, {
      userId: ctx.userId,
      action: 'STATEMENT_DOWNLOAD',
      resourceType: RESOURCE_TYPE,
      resourceId: statementId,
      ipAddress: ctx.ip,
      metadata: { provider: row.provider },
    });
    return {
      content,
      filename: row.attachment_filename ?? DEFAULT_FILENAME,
      contentType: contentTypeOf(content),
    };
  }

  /** A rejected grant parks the mailbox at once, so the UI offers Reconnect instead of retries. */
  private async fetchAttachment(ctx: RequestContext, row: StatementRow): Promise<Buffer> {
    const provider = this.deps.providers.get(row.provider);
    if (!row.attachment_locator || !provider) throw unavailable(ctx);
    try {
      const grant = await obtainAccess(this.deps, provider, {
        id: row.mailbox_id,
        credential_enc: row.credential_enc,
      });
      return await provider.getAttachment(
        grant.accessToken,
        row.source_message_id,
        row.attachment_locator,
      );
    } catch (err) {
      if (err instanceof ProviderNotFoundError) throw unavailable(ctx);
      if (err instanceof ReauthRequiredError) {
        await markReauthRequired(this.deps.db, row.mailbox_id);
        throw mailboxReauthRequired(ctx.lng);
      }
      throw err;
    }
  }
}
