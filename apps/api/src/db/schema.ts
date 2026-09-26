import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  smallint,
  numeric,
  char,
  pgEnum,
  inet,
  jsonb,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';

export const cardStatusEnum = pgEnum('card_status', ['ACTIVE', 'BLOCKED', 'EXPIRED', 'CLOSED']);
export const cardNetworkEnum = pgEnum('card_network', [
  'VISA',
  'MASTERCARD',
  'AMEX',
  'RUPAY',
  'DINERS',
  'OTHER',
]);
export const cardVariantEnum = pgEnum('card_variant', [
  'CLASSIC',
  'GOLD',
  'PLATINUM',
  'INFINITE',
  'SIGNATURE',
  'OTHER',
]);
export const auditActionEnum = pgEnum('audit_action', [
  'USER_REGISTER',
  'USER_LOGIN',
  'USER_LOGIN_FAILED',
  'USER_LOGOUT',
  'USER_DELETE',
  'TOKEN_REFRESH',
  'USER_PROFILE_VIEW',
  'USER_PROFILE_UPDATE',
  'DATA_EXPORT_REQUEST',
  'PAN_REGISTER',
  'PAN_VIEW',
  'OVERVIEW_VIEW',
  'CARD_LIST',
  'CARD_VIEW',
  'BANK_ACCOUNT_LIST',
  'LOAN_LIST',
  'INVESTMENT_LIST',
  'INSURANCE_LIST',
  'AUDIT_LOG_VIEW',
  'MAILBOX_LINK',
  'MAILBOX_UNLINK',
  'MAILBOX_SYNC',
  'EMAIL_CARD_LIST',
  'EMAIL_ACCOUNT_LIST',
  'STATEMENT_DOWNLOAD',
]);
// USER rows / EMAIL rows: see credit_cards and bank_accounts below — mirrored by db/mailbox.schema.ts too.
export const recordSourceEnum = pgEnum('record_source', ['USER', 'EMAIL']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 50 }).notNull().unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  consentGivenAt: timestamp('consent_given_at', { withTimezone: true }),
  consentVersion: varchar('consent_version', { length: 20 }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const panProfiles = pgTable('pan_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  panHash: text('pan_hash').notNull().unique(),
  panMasked: char('pan_masked', { length: 10 }).notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// USER rows: added by the user, all identity fields required.
// EMAIL rows: derived from bank emails; only masked last4 + bank are known.
export const creditCards = pgTable(
  'credit_cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    panProfileId: uuid('pan_profile_id')
      .notNull()
      .references(() => panProfiles.id, { onDelete: 'cascade' }),
    source: recordSourceEnum('source').notNull().default('USER'),
    cardNumberHash: text('card_number_hash'),
    cardNumberLast4: char('card_number_last4', { length: 4 }).notNull(),
    cardNetwork: cardNetworkEnum('card_network'),
    issuingBank: varchar('issuing_bank', { length: 100 }).notNull(),
    cardVariant: cardVariantEnum('card_variant').notNull().default('CLASSIC'),
    expiryMonth: smallint('expiry_month'),
    expiryYear: smallint('expiry_year'),
    nameOnCard: varchar('name_on_card', { length: 100 }),
    status: cardStatusEnum('status').notNull().default('ACTIVE'),
    creditLimit: numeric('credit_limit', { precision: 15, scale: 2 }),
    availableCredit: numeric('available_credit', { precision: 15, scale: 2 }),
    currentBalance: numeric('current_balance', { precision: 15, scale: 2 }),
    billingCycleDay: smallint('billing_cycle_day'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_credit_cards_card_number_hash')
      .on(t.cardNumberHash)
      .where(sql`${t.cardNumberHash} IS NOT NULL`),
    uniqueIndex('uq_credit_cards_email')
      .on(t.panProfileId, t.issuingBank, t.cardNumberLast4)
      .where(sql`${t.source} = 'EMAIL'`),
    check(
      'credit_cards_user_fields_required',
      sql`${t.source} <> 'USER' OR (${t.cardNumberHash} IS NOT NULL AND ${t.cardNetwork} IS NOT NULL AND ${t.expiryMonth} IS NOT NULL AND ${t.expiryYear} IS NOT NULL AND ${t.nameOnCard} IS NOT NULL)`,
    ),
  ],
);

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  userAgent: text('user_agent'),
  ipAddress: inet('ip_address'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: auditActionEnum('action').notNull(),
  resourceType: varchar('resource_type', { length: 50 }),
  resourceId: uuid('resource_id'),
  ipAddress: inet('ip_address'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type PanProfile = typeof panProfiles.$inferSelect;
export type NewPanProfile = typeof panProfiles.$inferInsert;
export type CreditCard = typeof creditCards.$inferSelect;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
