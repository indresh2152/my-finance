import request from 'supertest';
import { createApp } from '../app';
import { MAILBOX_CALLBACK_MAX_PER_MINUTE } from '../middleware/rateLimit.middleware';

// Own file: the limiter is a module-level singleton, so its count must not leak into other tests.
const completeConnect = jest.fn().mockResolvedValue({ userId: 'user-1', mailboxId: 'mb-1' });

const app = createApp({
  db: { query: jest.fn().mockResolvedValue({ rows: [] }) } as never,
  jwtSecret: 'test-jwt-secret-at-least-32-chars!!',
  refreshTokenSecret: 'test-refresh-secret-32-chars-min!!',
  panHmacSecret: 'test-pan-hmac-at-least-32-chars-min!',
  panVerifier: { verify: jest.fn() } as never,
  mailbox: { service: { completeConnect } as never, appBaseUrl: 'https://app.example' },
});

const CALLBACK = '/api/v1/mailboxes/oauth/callback/google?code=c&state=s';

describe('GET /api/v1/mailboxes/oauth/callback/:provider rate limit', () => {
  it('should return a JSON 429 once the per-IP limit is exceeded', async () => {
    for (let i = 0; i < MAILBOX_CALLBACK_MAX_PER_MINUTE; i += 1) {
      const ok = await request(app).get(CALLBACK);
      expect(ok.status).toBe(302);
    }
    const res = await request(app).get(CALLBACK);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(completeConnect).toHaveBeenCalledTimes(MAILBOX_CALLBACK_MAX_PER_MINUTE);
  });
});
