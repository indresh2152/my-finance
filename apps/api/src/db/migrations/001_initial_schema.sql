-- Migration: 001_initial_schema

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
    'BANK_ACCOUNT_LIST', 'LOAN_LIST', 'INVESTMENT_LIST', 'INSURANCE_LIST', 'AUDIT_LOG_VIEW'
  );
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

CREATE TABLE IF NOT EXISTS credit_cards (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  pan_profile_id    UUID         NOT NULL REFERENCES pan_profiles(id) ON DELETE CASCADE,
  card_number_hash  TEXT         NOT NULL UNIQUE,
  card_number_last4 CHAR(4)      NOT NULL,
  card_network      card_network NOT NULL,
  issuing_bank      VARCHAR(100) NOT NULL,
  card_variant      card_variant NOT NULL DEFAULT 'CLASSIC',
  expiry_month      SMALLINT     NOT NULL CHECK (expiry_month BETWEEN 1 AND 12),
  expiry_year       SMALLINT     NOT NULL CHECK (expiry_year >= 2020),
  name_on_card      VARCHAR(100) NOT NULL,
  status            card_status  NOT NULL DEFAULT 'ACTIVE',
  credit_limit      NUMERIC(15,2),
  available_credit  NUMERIC(15,2),
  current_balance   NUMERIC(15,2),
  billing_cycle_day SMALLINT     CHECK (billing_cycle_day BETWEEN 1 AND 31),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_cards_pan_profile_id ON credit_cards (pan_profile_id);
CREATE INDEX IF NOT EXISTS idx_credit_cards_status         ON credit_cards (status);

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
