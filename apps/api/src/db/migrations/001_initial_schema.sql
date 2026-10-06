-- Migration: 001_initial_schema
-- Idempotent: every statement is guarded (IF NOT EXISTS / duplicate_object).

DO $$ BEGIN
  CREATE TYPE card_status AS ENUM ('ACTIVE', 'BLOCKED', 'EXPIRED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE card_network AS ENUM ('VISA', 'MASTERCARD', 'AMEX', 'RUPAY', 'DINERS', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE card_variant AS ENUM ('CLASSIC', 'GOLD', 'PLATINUM', 'INFINITE', 'SIGNATURE', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE audit_action AS ENUM (
    'USER_REGISTER', 'USER_LOGIN', 'USER_LOGIN_FAILED', 'USER_LOGOUT', 'USER_DELETE',
    'TOKEN_REFRESH', 'USER_PROFILE_VIEW', 'USER_PROFILE_UPDATE', 'DATA_EXPORT_REQUEST',
    'PAN_REGISTER', 'PAN_VIEW', 'OVERVIEW_VIEW', 'CARD_LIST', 'CARD_VIEW',
    'LOAN_LIST', 'INVESTMENT_LIST', 'INSURANCE_LIST', 'AUDIT_LOG_VIEW',
    'MAILBOX_LINK', 'MAILBOX_UNLINK', 'MAILBOX_SYNC',
    'EMAIL_CARD_LIST', 'STATEMENT_DOWNLOAD'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE record_source AS ENUM ('USER', 'EMAIL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE mail_provider AS ENUM ('GOOGLE', 'MICROSOFT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE mail_auth_type AS ENUM ('OAUTH');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE mail_connection_status AS ENUM ('ACTIVE', 'REAUTH_REQUIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE mail_sync_status AS ENUM ('NEVER', 'RUNNING', 'SUCCEEDED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  username         VARCHAR(50)  NOT NULL UNIQUE,
  email            VARCHAR(255) NOT NULL UNIQUE,
  password_hash    TEXT         NOT NULL,
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  consent_given_at TIMESTAMPTZ,
  consent_version  VARCHAR(20),
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email    ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);

CREATE TABLE IF NOT EXISTS pan_profiles (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  pan_hash    TEXT        NOT NULL UNIQUE,
  pan_masked  CHAR(10)    NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pan_profiles_pan_hash ON pan_profiles (pan_hash);

-- USER rows: added by the user, all identity fields required.
-- EMAIL rows: derived from bank emails; only bank, masked last4 and the card's name (from the
-- subject) are known. Some banks' emails never show the digits (HDFC Pixel, Scapia, OneCard): those
-- cards are told apart by name and billing_cycle_day, since one holder can have two cards of the same
-- name. The service matches them; a unique index cannot (the day may drift around month-end).
CREATE TABLE IF NOT EXISTS credit_cards (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  pan_profile_id    UUID          NOT NULL REFERENCES pan_profiles(id) ON DELETE CASCADE,
  source            record_source NOT NULL DEFAULT 'USER',
  card_number_hash  TEXT,
  card_number_last4 CHAR(4),
  card_name         VARCHAR(60),                 -- e.g. 'Pixel Play'; NULL when the subject names none
  card_network      card_network,
  issuing_bank      VARCHAR(100)  NOT NULL,
  card_variant      card_variant  NOT NULL DEFAULT 'CLASSIC',
  expiry_month      SMALLINT      CHECK (expiry_month BETWEEN 1 AND 12),
  expiry_year       SMALLINT      CHECK (expiry_year >= 2020),
  name_on_card      VARCHAR(100),
  status            card_status   NOT NULL DEFAULT 'ACTIVE',
  credit_limit      NUMERIC(15,2),
  available_credit  NUMERIC(15,2),
  current_balance   NUMERIC(15,2),
  billing_cycle_day SMALLINT      CHECK (billing_cycle_day BETWEEN 1 AND 31),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  -- USER cards keep their digits; an EMAIL card needs its digits or its name.
  CONSTRAINT credit_cards_identity_required CHECK (
    card_number_last4 IS NOT NULL OR (source = 'EMAIL' AND card_name IS NOT NULL)
  ),
  CONSTRAINT credit_cards_user_fields_required CHECK (
    source <> 'USER' OR (
      card_number_hash IS NOT NULL AND card_network IS NOT NULL
      AND expiry_month IS NOT NULL AND expiry_year IS NOT NULL AND name_on_card IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_credit_cards_pan_profile_id ON credit_cards (pan_profile_id);
CREATE INDEX IF NOT EXISTS idx_credit_cards_status         ON credit_cards (status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_cards_card_number_hash
  ON credit_cards (card_number_hash) WHERE card_number_hash IS NOT NULL;
-- A card with digits is its digits: a name stored next to them never makes a second card.
CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_cards_email
  ON credit_cards (pan_profile_id, issuing_bank, card_number_last4)
  WHERE source = 'EMAIL' AND card_number_last4 IS NOT NULL;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT        NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  user_agent TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id    ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens (expires_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID         REFERENCES users(id) ON DELETE SET NULL,
  action        audit_action NOT NULL,
  resource_type VARCHAR(50),
  resource_id   UUID,
  ip_address    INET,
  metadata      JSONB,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id    ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action     ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);

-- One row per linked mailbox. credential_enc = AES-256-GCM(refresh token).
CREATE TABLE IF NOT EXISTS mail_connections (
  id                     UUID                   PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID                   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider               mail_provider          NOT NULL,
  auth_type              mail_auth_type         NOT NULL DEFAULT 'OAUTH',
  email_hash             TEXT                   NOT NULL,
  email_masked           VARCHAR(255)           NOT NULL,
  credential_enc         BYTEA                  NOT NULL,
  credential_key_version SMALLINT               NOT NULL,
  scopes                 TEXT                   NOT NULL,
  status                 mail_connection_status NOT NULL DEFAULT 'ACTIVE',
  last_sync_status       mail_sync_status       NOT NULL DEFAULT 'NEVER',
  last_sync_error_code   VARCHAR(50),
  last_synced_at         TIMESTAMPTZ,
  -- sha256 of the sorted parser sender list used by the last successful sync; a change forces a 180-day rescan
  synced_senders_hash    TEXT,
  created_at             TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_mail_connections_user_email UNIQUE (user_id, email_hash)
);

-- Short-lived OAuth state (10 min), deleted on use.
CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash        TEXT          PRIMARY KEY,
  user_id           UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider          mail_provider NOT NULL,
  login_hint_enc    BYTEA         NOT NULL,
  code_verifier_enc BYTEA         NOT NULL,
  expires_at        TIMESTAMPTZ   NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at ON oauth_states (expires_at);

CREATE TABLE IF NOT EXISTS card_statements (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_card_id      UUID          NOT NULL REFERENCES credit_cards(id) ON DELETE CASCADE,
  mail_connection_id  UUID          NOT NULL REFERENCES mail_connections(id) ON DELETE CASCADE,
  statement_date      DATE          NOT NULL,
  -- No due date only on a statement with nothing due ("No Payment Due").
  due_date            DATE,
  total_amount_due    NUMERIC(15,2) NOT NULL,
  minimum_amount_due  NUMERIC(15,2),
  password_hint       TEXT,
  source_message_id   TEXT          NOT NULL,
  attachment_locator  TEXT,
  attachment_filename VARCHAR(255),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT card_statements_due_date_required CHECK (due_date IS NOT NULL OR total_amount_due <= 0),
  CONSTRAINT uq_card_statements_card_mailbox_date UNIQUE (credit_card_id, mail_connection_id, statement_date)
);

CREATE INDEX IF NOT EXISTS idx_card_statements_mail_connection_id ON card_statements (mail_connection_id);
