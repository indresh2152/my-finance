import { z } from 'zod';
import { parseKeyRing, type KeyRing } from '../utils/crypto.utils';

const MIN_SECRET_LENGTH = 32;
const MIN_KEY_VERSION = 1;
const MAX_KEY_VERSION = 255;
const DEFAULT_SYNC_CRON = '0 */6 * * *';
const TRAILING_SLASHES = /\/+$/;

const envSchema = z.object({
  APP_BASE_URL: z.string().url(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  MICROSOFT_CLIENT_ID: z.string().min(1),
  MICROSOFT_CLIENT_SECRET: z.string().min(1),
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
  google: OAuthClientConfig;
  microsoft: OAuthClientConfig;
  keyRing: KeyRing;
  emailHmacSecret: string;
  syncCron: string;
}

/** Returns null when MAILBOX_ENABLED is not 'true'; throws (fail fast at startup) on invalid config. */
export const loadMailboxConfig = (env: NodeJS.ProcessEnv): MailboxConfig | null => {
  if (env['MAILBOX_ENABLED'] !== 'true') {
    return null;
  }

  const parsed = envSchema.parse(env);

  return {
    appBaseUrl: parsed.APP_BASE_URL.replace(TRAILING_SLASHES, ''),
    google: { clientId: parsed.GOOGLE_CLIENT_ID, clientSecret: parsed.GOOGLE_CLIENT_SECRET },
    microsoft: {
      clientId: parsed.MICROSOFT_CLIENT_ID,
      clientSecret: parsed.MICROSOFT_CLIENT_SECRET,
    },
    keyRing: parseKeyRing(
      parsed.MAIL_CREDENTIAL_ENC_KEYS,
      parsed.MAIL_CREDENTIAL_ENC_ACTIVE_VERSION,
    ),
    emailHmacSecret: parsed.EMAIL_HMAC_SECRET,
    syncCron: parsed.MAIL_SYNC_CRON,
  };
};
