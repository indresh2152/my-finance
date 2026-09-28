import { z } from 'zod';
import { parseKeyRing, type KeyRing } from '../utils/crypto.utils';

const MIN_SECRET_LENGTH = 32;
const MIN_KEY_VERSION = 1;
const MAX_KEY_VERSION = 255;
const DEFAULT_SYNC_CRON = '0 */6 * * *';
const TRAILING_SLASHES = /\/+$/;

/** Blank values count as unset so a half-filled .env line does not enable a provider. */
const optionalSecret = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

const envSchema = z.object({
  APP_BASE_URL: z.string().url(),
  GOOGLE_CLIENT_ID: optionalSecret,
  GOOGLE_CLIENT_SECRET: optionalSecret,
  MICROSOFT_CLIENT_ID: optionalSecret,
  MICROSOFT_CLIENT_SECRET: optionalSecret,
  MAIL_CREDENTIAL_ENC_KEYS: z.string().min(1),
  MAIL_CREDENTIAL_ENC_ACTIVE_VERSION: z.coerce
    .number()
    .int()
    .min(MIN_KEY_VERSION)
    .max(MAX_KEY_VERSION),
  EMAIL_HMAC_SECRET: z.string().min(MIN_SECRET_LENGTH),
  MAIL_SYNC_CRON: z.string().min(1).default(DEFAULT_SYNC_CRON),
});

export interface OAuthClientConfig {
  clientId: string;
  clientSecret: string;
}

export interface MailboxConfig {
  appBaseUrl: string;
  /** null when the provider's OAuth client is not configured; at least one is always set. */
  google: OAuthClientConfig | null;
  microsoft: OAuthClientConfig | null;
  keyRing: KeyRing;
  emailHmacSecret: string;
  syncCron: string;
}

const toClient = (
  name: string,
  clientId: string | undefined,
  clientSecret: string | undefined,
): OAuthClientConfig | null => {
  if (clientId && clientSecret) {
    return { clientId, clientSecret };
  }
  if (clientId || clientSecret) {
    throw new Error(`${name}_CLIENT_ID and ${name}_CLIENT_SECRET must be set together`);
  }
  return null;
};

/**
 * Returns null when MAILBOX_ENABLED is not 'true'; throws (fail fast at startup) on invalid config.
 * Google and Microsoft are each optional, but at least one must be configured.
 */
export const loadMailboxConfig = (env: NodeJS.ProcessEnv): MailboxConfig | null => {
  if (env['MAILBOX_ENABLED'] !== 'true') {
    return null;
  }

  const parsed = envSchema.parse(env);
  const google = toClient('GOOGLE', parsed.GOOGLE_CLIENT_ID, parsed.GOOGLE_CLIENT_SECRET);
  const microsoft = toClient(
    'MICROSOFT',
    parsed.MICROSOFT_CLIENT_ID,
    parsed.MICROSOFT_CLIENT_SECRET,
  );
  if (!google && !microsoft) {
    throw new Error('MAILBOX_ENABLED=true needs Google or Microsoft OAuth client credentials');
  }

  return {
    appBaseUrl: parsed.APP_BASE_URL.replace(TRAILING_SLASHES, ''),
    google,
    microsoft,
    keyRing: parseKeyRing(
      parsed.MAIL_CREDENTIAL_ENC_KEYS,
      parsed.MAIL_CREDENTIAL_ENC_ACTIVE_VERSION,
    ),
    emailHmacSecret: parsed.EMAIL_HMAC_SECRET,
    syncCron: parsed.MAIL_SYNC_CRON,
  };
};
