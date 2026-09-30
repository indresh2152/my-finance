import request from 'supertest';
import { createApp, type AppDeps } from '../app';
import { signAccessToken } from '../utils/token.utils';
import { AppError } from '../middleware/error.middleware';
import { withEnv } from '../test/with-env';

const JWT_SECRET = 'test-jwt-secret-at-least-32-chars!!';
const MAILBOX_ID = '7b0c8f7e-3c2a-4a55-9f0e-2d8f6f0b1a11';

const service = {
  resolve: jest.fn(),
  startConnect: jest.fn(),
  completeConnect: jest.fn(),
  list: jest.fn(),
  requestSync: jest.fn(),
  unlink: jest.fn(),
};

const statements = { download: jest.fn() };
const accounts = { list: jest.fn() };

const deps: AppDeps = {
  db: { query: jest.fn().mockResolvedValue({ rows: [] }) } as never,
  jwtSecret: JWT_SECRET,
  refreshTokenSecret: 'test-refresh-secret-32-chars-min!!',
  panHmacSecret: 'test-pan-hmac-at-least-32-chars-min!',
  panVerifier: { verify: jest.fn() } as never,
  mailbox: {
    service: service as never,
    statements: statements as never,
    accounts: accounts as never,
    appBaseUrl: 'https://app.example',
  },
};

const app = createApp(deps);
const token = signAccessToken(
  { userId: 'user-1', username: 'u', email: 'e@e.com', hasPan: true },
  JWT_SECRET,
);
const auth = { Authorization: `Bearer ${token}` };

const firstCookie = (headers: Record<string, unknown>): string => {
  const cookies = headers['set-cookie'];
  return Array.isArray(cookies) && typeof cookies[0] === 'string' ? cookies[0] : '';
};

afterEach(() => jest.clearAllMocks());

describe('POST /api/v1/mailboxes/resolve', () => {
  it('should return 401 without a token', async () => {
    await request(app).post('/api/v1/mailboxes/resolve').send({ email: 'a@gmail.com' }).expect(401);
    expect(service.resolve).not.toHaveBeenCalled();
  });

  it('should return the resolution for the trimmed email', async () => {
    service.resolve.mockResolvedValueOnce({
      supported: true,
      provider: 'GOOGLE',
      authType: 'OAUTH',
    });
    const res = await request(app)
      .post('/api/v1/mailboxes/resolve')
      .set(auth)
      .send({ email: ' a@gmail.com ' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ supported: true, provider: 'GOOGLE', authType: 'OAUTH' });
    expect(service.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', lng: 'en' }),
      'a@gmail.com',
    );
  });

  it.each([{ email: 'nope' }, {}, { email: `${'a'.repeat(250)}@x.com` }])(
    'should return 422 for an invalid body %#',
    async (body) => {
      const res = await request(app).post('/api/v1/mailboxes/resolve').set(auth).send(body);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    },
  );

  it('should pass service errors to the error middleware', async () => {
    service.resolve.mockRejectedValueOnce(new AppError('MAILBOX_ALREADY_LINKED', 409, 'linked'));
    const res = await request(app)
      .post('/api/v1/mailboxes/resolve')
      .set(auth)
      .send({ email: 'a@gmail.com' });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/v1/mailboxes/connect', () => {
  it('should return 401 without a token', async () => {
    await request(app).post('/api/v1/mailboxes/connect').send({ email: 'a@gmail.com' }).expect(401);
  });

  it('should return only the auth URL and bind the state to this browser with an HttpOnly cookie', async () => {
    service.startConnect.mockResolvedValueOnce({
      authUrl: 'https://accounts.example/auth',
      state: 'st-123',
    });
    const res = await request(app)
      .post('/api/v1/mailboxes/connect')
      .set(auth)
      .send({ email: 'a@gmail.com' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ authUrl: 'https://accounts.example/auth' });
    const cookie = firstCookie(res.headers);
    expect(cookie).toContain('mf_mailbox_oauth=st-123');
    expect(cookie).toContain('Path=/api/v1/mailboxes/oauth');
    expect(cookie).toContain('Max-Age=600');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Secure');
  });

  it(
    'should mark the state cookie Secure in production',
    withEnv({ NODE_ENV: 'production' }, async () => {
      service.startConnect.mockResolvedValueOnce({ authUrl: 'https://a.example', state: 's' });
      const res = await request(createApp(deps))
        .post('/api/v1/mailboxes/connect')
        .set(auth)
        .send({ email: 'a@gmail.com' });
      expect(firstCookie(res.headers)).toContain('Secure');
    }),
  );

  it('should pass service errors on without setting a cookie', async () => {
    service.startConnect.mockRejectedValueOnce(new AppError('PROVIDER_NOT_SUPPORTED', 422, 'no'));
    const res = await request(app)
      .post('/api/v1/mailboxes/connect')
      .set(auth)
      .send({ email: 'a@yahoo.com' });
    expect(res.status).toBe(422);
    expect(firstCookie(res.headers)).toBe('');
  });
});

describe('GET /api/v1/mailboxes', () => {
  it('should return 401 without a token', async () => {
    await request(app).get('/api/v1/mailboxes').expect(401);
  });

  it('should list mailboxes', async () => {
    service.list.mockResolvedValueOnce([{ id: 'mb-1' }]);
    const res = await request(app).get('/api/v1/mailboxes').set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mailboxes: [{ id: 'mb-1' }] });
  });

  it('should pass errors on', async () => {
    service.list.mockRejectedValueOnce(new AppError('PAN_NOT_REGISTERED', 403, 'no pan'));
    await request(app).get('/api/v1/mailboxes').set(auth).expect(403);
  });
});

describe('POST /api/v1/mailboxes/:mailboxId/sync', () => {
  it('should return 401 without a token', async () => {
    await request(app).post(`/api/v1/mailboxes/${MAILBOX_ID}/sync`).expect(401);
  });

  it('should queue a sync and return 202', async () => {
    service.requestSync.mockResolvedValueOnce(undefined);
    const res = await request(app).post(`/api/v1/mailboxes/${MAILBOX_ID}/sync`).set(auth);
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ queued: true });
    expect(service.requestSync).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
      MAILBOX_ID,
    );
  });

  it('should reject a non-uuid id with 422', async () => {
    await request(app).post('/api/v1/mailboxes/not-a-uuid/sync').set(auth).expect(422);
    expect(service.requestSync).not.toHaveBeenCalled();
  });

  it('should pass errors on', async () => {
    service.requestSync.mockRejectedValueOnce(new AppError('SYNC_TOO_FREQUENT', 429, 'wait'));
    await request(app).post(`/api/v1/mailboxes/${MAILBOX_ID}/sync`).set(auth).expect(429);
  });
});

describe('DELETE /api/v1/mailboxes/:mailboxId', () => {
  it('should return 401 without a token', async () => {
    await request(app).delete(`/api/v1/mailboxes/${MAILBOX_ID}`).expect(401);
  });

  it('should unlink and return 204', async () => {
    service.unlink.mockResolvedValueOnce(undefined);
    await request(app).delete(`/api/v1/mailboxes/${MAILBOX_ID}`).set(auth).expect(204);
    expect(service.unlink).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
      MAILBOX_ID,
    );
  });

  it('should reject a non-uuid id with 422', async () => {
    await request(app).delete('/api/v1/mailboxes/not-a-uuid').set(auth).expect(422);
  });

  it('should pass errors on', async () => {
    service.unlink.mockRejectedValueOnce(new AppError('MAILBOX_NOT_FOUND', 404, 'nf'));
    await request(app).delete(`/api/v1/mailboxes/${MAILBOX_ID}`).set(auth).expect(404);
  });
});

describe('GET /api/v1/mailboxes/accounts', () => {
  it('should return 401 without a token', async () => {
    await request(app).get('/api/v1/mailboxes/accounts').expect(401);
    expect(accounts.list).not.toHaveBeenCalled();
  });

  it('should return the accounts under data', async () => {
    const account = {
      id: 'acc-1',
      bankName: 'ICICI',
      accountNumberLast4: '5678',
      accountType: 'SAVINGS',
      availableBalance: 234567.89,
      balanceAsOf: '2026-09-24T10:12:00.000Z',
    };
    accounts.list.mockResolvedValueOnce([account]);
    const res = await request(app).get('/api/v1/mailboxes/accounts').set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [account] });
    expect(accounts.list).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1' }));
  });

  it('should pass service errors to the error handler', async () => {
    accounts.list.mockRejectedValueOnce(new AppError('PAN_NOT_REGISTERED', 403, 'No PAN'));
    const res = await request(app).get('/api/v1/mailboxes/accounts').set(auth);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PAN_NOT_REGISTERED');
  });
});

describe('GET /api/v1/mailboxes/statements/:statementId/download', () => {
  const STATEMENT_ID = '0f7c2b4e-9d1a-4c3b-8e2f-5a6b7c8d9e0f';
  const url = `/api/v1/mailboxes/statements/${STATEMENT_ID}/download`;

  it('should return 401 without a token', async () => {
    await request(app).get(url).expect(401);
    expect(statements.download).not.toHaveBeenCalled();
  });

  it('should send the file as a non-cacheable attachment', async () => {
    statements.download.mockResolvedValueOnce({
      content: Buffer.from('%PDF-1.7'),
      filename: 'HDFC Statement.pdf',
      contentType: 'application/pdf',
    });
    const res = await request(app).get(url).set(auth);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-disposition']).toBe('attachment; filename="HDFC Statement.pdf"');
    expect(statements.download).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
      STATEMENT_ID,
    );
  });

  it('should keep an untrusted filename from breaking out of the header or the download folder', async () => {
    statements.download.mockResolvedValueOnce({
      content: Buffer.from('x'),
      filename: '../../etc/pass"wd\r\nX-Evil: 1',
      contentType: 'application/octet-stream',
    });
    const res = await request(app).get(url).set(auth);
    expect(res.status).toBe(200);
    expect(res.headers['x-evil']).toBeUndefined();
    expect(res.headers['content-disposition']).not.toContain('..');
    expect(res.headers['content-type']).toBe('application/octet-stream');
  });

  it('should return 422 for a malformed statement id', async () => {
    const res = await request(app).get('/api/v1/mailboxes/statements/nope/download').set(auth);
    expect(res.status).toBe(422);
    expect(statements.download).not.toHaveBeenCalled();
  });

  it('should pass service errors to the error middleware', async () => {
    statements.download.mockRejectedValueOnce(new AppError('STATEMENT_UNAVAILABLE', 404, 'gone'));
    const res = await request(app).get(url).set(auth);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('STATEMENT_UNAVAILABLE');
  });
});
