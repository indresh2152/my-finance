import request from 'supertest';
import { createApp } from '../app';
import { MailboxLinkError } from '../services/mailbox/mailbox.service';

const completeConnect = jest.fn();

const app = createApp({
  db: { query: jest.fn().mockResolvedValue({ rows: [] }) } as never,
  jwtSecret: 'test-jwt-secret-at-least-32-chars!!',
  refreshTokenSecret: 'test-refresh-secret-32-chars-min!!',
  panHmacSecret: 'test-pan-hmac-at-least-32-chars-min!',
  panVerifier: { verify: jest.fn() } as never,
  mailbox: {
    service: { completeConnect } as never,
    statements: {} as never,
    appBaseUrl: 'https://app.example',
  },
});

const CALLBACK = '/api/v1/mailboxes/oauth/callback';
const PAGE = 'https://app.example/profile';
const CLEARED_COOKIE = /^mf_mailbox_oauth=;.*Path=\/api\/v1\/mailboxes\/oauth/;

const firstCookie = (headers: Record<string, unknown>): string => {
  const cookies = headers['set-cookie'];
  return Array.isArray(cookies) && typeof cookies[0] === 'string' ? cookies[0] : '';
};

afterEach(() => jest.clearAllMocks());

describe('GET /api/v1/mailboxes/oauth/callback/:provider', () => {
  it('should redirect with linked=1 on success (no JWT required) and clear the cookie', async () => {
    completeConnect.mockResolvedValueOnce({ userId: 'user-1', mailboxId: 'mb-1' });
    const res = await request(app)
      .get(`${CALLBACK}/google?code=c&state=s`)
      .set('Cookie', 'mf_mailbox_oauth=s');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe(`${PAGE}?linked=1`);
    expect(completeConnect).toHaveBeenCalledWith({
      provider: 'GOOGLE',
      code: 'c',
      state: 's',
      browserState: 's',
      error: undefined,
      errorDescription: undefined,
    });
    expect(firstCookie(res.headers)).toMatch(CLEARED_COOKIE);
  });

  it('should pass an absent cookie through so the service rejects the callback', async () => {
    completeConnect.mockRejectedValueOnce(new MailboxLinkError('MAILBOX_LINK_FAILED'));
    const res = await request(app).get(`${CALLBACK}/google?code=c&state=s`);
    expect(completeConnect).toHaveBeenCalledWith(
      expect.objectContaining({ browserState: undefined }),
    );
    expect(res.headers['location']).toBe(`${PAGE}?error=MAILBOX_LINK_FAILED`);
    expect(firstCookie(res.headers)).toMatch(CLEARED_COOKIE);
  });

  it('should forward provider error parameters and ignore extra ones', async () => {
    completeConnect.mockRejectedValueOnce(new MailboxLinkError('MAILBOX_ACCESS_DENIED'));
    const res = await request(app).get(
      `${CALLBACK}/microsoft?state=s&error=access_denied&error_description=denied&session_state=x`,
    );
    expect(completeConnect).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'MICROSOFT',
        error: 'access_denied',
        errorDescription: 'denied',
      }),
    );
    expect(res.headers['location']).toBe(`${PAGE}?error=MAILBOX_ACCESS_DENIED`);
  });

  it.each([
    ['an unknown provider', '/yahoo?code=c&state=s'],
    ['an inherited __proto__ key', '/__proto__?code=c&state=s'],
    ['an inherited constructor key', '/constructor?code=c&state=s'],
    ['an inherited toString key', '/toString?code=c&state=s'],
    ['repeated query parameters', '/google?code=a&code=b&state=s'],
  ])('should redirect with MAILBOX_LINK_FAILED for %s', async (_case, path) => {
    const res = await request(app).get(`${CALLBACK}${path}`).set('Cookie', 'mf_mailbox_oauth=s');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe(`${PAGE}?error=MAILBOX_LINK_FAILED`);
    expect(completeConnect).not.toHaveBeenCalled();
    expect(firstCookie(res.headers)).toMatch(CLEARED_COOKIE);
  });

  it('should redirect with MAILBOX_LINK_FAILED on unexpected errors', async () => {
    completeConnect.mockRejectedValueOnce(new Error('db down'));
    const res = await request(app).get(`${CALLBACK}/google?code=c&state=s`);
    expect(res.headers['location']).toBe(`${PAGE}?error=MAILBOX_LINK_FAILED`);
  });
});
