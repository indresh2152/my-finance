import { loadMailboxConfig } from './mailbox.config';

const KEY = 'ab'.repeat(32);

const validEnv = (): NodeJS.ProcessEnv => ({
  MAILBOX_ENABLED: 'true',
  APP_BASE_URL: 'https://finance.example.com/',
  GOOGLE_CLIENT_ID: 'g-id',
  GOOGLE_CLIENT_SECRET: 'g-secret',
  MICROSOFT_CLIENT_ID: 'm-id',
  MICROSOFT_CLIENT_SECRET: 'm-secret',
  MAIL_CREDENTIAL_ENC_KEYS: `1:${KEY}`,
  MAIL_CREDENTIAL_ENC_ACTIVE_VERSION: '1',
  EMAIL_HMAC_SECRET: 'x'.repeat(32),
});

describe('loadMailboxConfig', () => {
  it('should return null when the feature is disabled', () => {
    expect(loadMailboxConfig({ MAILBOX_ENABLED: 'false' })).toBeNull();
    expect(loadMailboxConfig({})).toBeNull();
  });

  it('should build the config and strip the trailing slash from the base URL', () => {
    const config = loadMailboxConfig(validEnv());
    expect(config?.appBaseUrl).toBe('https://finance.example.com');
    expect(config?.google).toEqual({ clientId: 'g-id', clientSecret: 'g-secret' });
    expect(config?.microsoft).toEqual({ clientId: 'm-id', clientSecret: 'm-secret' });
    expect(config?.keyRing.activeVersion).toBe(1);
    expect(config?.syncCron).toBe('0 */6 * * *');
  });

  it('should use a custom sync cron when provided', () => {
    expect(loadMailboxConfig({ ...validEnv(), MAIL_SYNC_CRON: '*/30 * * * *' })?.syncCron).toBe(
      '*/30 * * * *',
    );
  });

  it('should fail fast when a required variable is missing', () => {
    const env = validEnv();
    delete env['GOOGLE_CLIENT_SECRET'];
    expect(() => loadMailboxConfig(env)).toThrow(/GOOGLE_CLIENT_SECRET/);
  });

  it('should fail fast on a short HMAC secret', () => {
    expect(() => loadMailboxConfig({ ...validEnv(), EMAIL_HMAC_SECRET: 'short' })).toThrow(
      /EMAIL_HMAC_SECRET/,
    );
  });
});
