import request from 'supertest';
import { createApp } from './app';
import type { AppDeps } from './app';

const mockDb = {
  query: jest.fn().mockResolvedValue({ rows: [] }),
};

const deps: AppDeps = {
  db: mockDb as never,
  jwtSecret: 'test-jwt-secret-at-least-32-chars!!',
  refreshTokenSecret: 'test-refresh-secret-32-chars-min!!',
  panHmacSecret: 'test-pan-hmac-secret-32-chars-min!',
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
