import request from 'supertest';
import { createApp } from './app';
import type { AppDeps } from './app';
import { withEnv } from './test/with-env';

const mockDb = {
  query: jest.fn().mockResolvedValue({ rows: [] }),
};

const deps: AppDeps = {
  db: mockDb as never,
  jwtSecret: 'test-jwt-secret-at-least-32-chars!!',
  refreshTokenSecret: 'test-refresh-secret-32-chars-min!!',
  panHmacSecret: 'test-pan-hmac-secret-32-chars-min!',
  panVerifier: { verify: jest.fn() } as never,
};

const app = createApp(deps);

afterEach(() => jest.clearAllMocks());

describe('GET /health', () => {
  it('should return 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });
});

describe('GET /ready', () => {
  it('should return 200 when DB query succeeds', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready', db: 'connected' });
  });

  it('should return 503 when DB query fails', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB down'));
    const res = await request(app).get('/ready');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'not ready', db: 'unreachable' });
  });
});

describe('unmatched /api paths in production', () => {
  it.each(['/api/docs/', '/api/v1/does-not-exist'])(
    'should return a JSON 404 for %s instead of the SPA shell',
    (path) =>
      withEnv({ NODE_ENV: 'production', API_DOCS_ENABLED: undefined }, async () => {
        const res = await request(createApp(deps)).get(path);
        expect(res.status).toBe(404);
        expect(res.headers['content-type']).toMatch(/application\/json/);
        expect(res.body.error.code).toBe('NOT_FOUND');
      })(),
  );
});
