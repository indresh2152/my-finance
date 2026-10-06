import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  smallint,
  numeric,
  date,
  pgEnum,
  customType,
  unique,
  check,
} from 'drizzle-orm/pg-core';
import { users, creditCards } from './schema';

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

export const mailProviderEnum = pgEnum('mail_provider', ['GOOGLE', 'MICROSOFT']);
export const mailAuthTypeEnum = pgEnum('mail_auth_type', ['OAUTH']);
export const mailConnectionStatusEnum = pgEnum('mail_connection_status', [
  'ACTIVE',
  'REAUTH_REQUIRED',
]);
export const mailSyncStatusEnum = pgEnum('mail_sync_status', [
  'NEVER',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
]);
// One row per linked mailbox. credentialEnc = AES-256-GCM(refresh token).
export const mailConnections = pgTable(
  'mail_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: mailProviderEnum('provider').notNull(),
    authType: mailAuthTypeEnum('auth_type').notNull().default('OAUTH'),
    emailHash: text('email_hash').notNull(),
    emailMasked: varchar('email_masked', { length: 255 }).notNull(),
    credentialEnc: bytea('credential_enc').notNull(),
    credentialKeyVersion: smallint('credential_key_version').notNull(),
    scopes: text('scopes').notNull(),
    status: mailConnectionStatusEnum('status').notNull().default('ACTIVE'),
    lastSyncStatus: mailSyncStatusEnum('last_sync_status').notNull().default('NEVER'),
    lastSyncErrorCode: varchar('last_sync_error_code', { length: 50 }),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    // sha256 of the sorted parser sender list used by the last successful sync; a change forces a 180-day rescan
    syncedSendersHash: text('synced_senders_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('uq_mail_connections_user_email').on(t.userId, t.emailHash)],
);

// Short-lived OAuth state (10 min), deleted on use.
export const oauthStates = pgTable('oauth_states', {
  stateHash: text('state_hash').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: mailProviderEnum('provider').notNull(),
  loginHintEnc: bytea('login_hint_enc').notNull(),
  codeVerifierEnc: bytea('code_verifier_enc').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const cardStatements = pgTable(
  'card_statements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creditCardId: uuid('credit_card_id')
      .notNull()
      .references(() => creditCards.id, { onDelete: 'cascade' }),
    mailConnectionId: uuid('mail_connection_id')
      .notNull()
      .references(() => mailConnections.id, { onDelete: 'cascade' }),
    statementDate: date('statement_date').notNull(),
    /** Null only on a statement with nothing due ('No Payment Due'). */
    dueDate: date('due_date'),
    totalAmountDue: numeric('total_amount_due', { precision: 15, scale: 2 }).notNull(),
    minimumAmountDue: numeric('minimum_amount_due', { precision: 15, scale: 2 }),
    passwordHint: text('password_hint'),
    sourceMessageId: text('source_message_id').notNull(),
    attachmentLocator: text('attachment_locator'),
    attachmentFilename: varchar('attachment_filename', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'card_statements_due_date_required',
      sql`${t.dueDate} IS NOT NULL OR ${t.totalAmountDue} <= 0`,
    ),
    unique('uq_card_statements_card_mailbox_date').on(
      t.creditCardId,
      t.mailConnectionId,
      t.statementDate,
    ),
  ],
);

export type MailConnection = typeof mailConnections.$inferSelect;
export type CardStatement = typeof cardStatements.$inferSelect;
