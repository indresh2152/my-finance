import type { Pool } from 'pg';
import pino from 'pino';

const logger = pino({ name: 'audit-writer' });

export type Queryable = Pick<Pool, 'query'>;

export type MailboxAuditAction =
  | 'MAILBOX_LINK'
  | 'MAILBOX_UNLINK'
  | 'MAILBOX_SYNC'
  | 'EMAIL_CARD_LIST'
  | 'EMAIL_ACCOUNT_LIST'
  | 'STATEMENT_DOWNLOAD';

export interface AuditEntry {
  userId: string | null;
  action: MailboxAuditAction;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
}

/** Writes an audit row explicitly (used where no HTTP route map applies, e.g. background jobs). Never throws. */
export const writeAuditLog = async (db: Queryable, entry: AuditEntry): Promise<void> => {
  try {
    await db.query(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, ip_address, metadata)
       VALUES ($1, $2, $3, $4, $5::inet, $6)`,
      [
        entry.userId,
        entry.action,
        entry.resourceType ?? null,
        entry.resourceId ?? null,
        entry.ipAddress ?? null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
      ],
    );
  } catch (err) {
    logger.error({ err, action: entry.action }, 'audit write failed');
  }
};
