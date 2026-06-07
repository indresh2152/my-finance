import type { Request, Response, NextFunction } from 'express';
import { EventEmitter } from 'events';
import { auditMiddleware } from './audit.middleware';

const makePool = (): { query: jest.Mock } => ({ query: jest.fn().mockResolvedValue({ rows: [] }) });

const makeReq = (overrides: Partial<Request> = {}): Partial<Request> => ({
  method: 'GET',
  path: '/api/v1/credit-cards',
  ip: '127.0.0.1',
  params: {},
  route: { path: '/credit-cards' },
  user: undefined,
  headers: {},
  ...overrides,
});

const makeRes = (): EventEmitter & Partial<Response> => {
  const emitter = new EventEmitter() as EventEmitter & Partial<Response>;
  emitter.statusCode = 200;
  return emitter;
};

const mockNext = jest.fn() as jest.MockedFunction<NextFunction>;

afterEach(() => jest.clearAllMocks());

describe('auditMiddleware', () => {
  it('should skip health and ready paths', () => {
    const pool = makePool();
    const middleware = auditMiddleware(pool as never);
    const req = makeReq({ path: '/health' }) as Request;
    const res = makeRes() as unknown as Response;
    middleware(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
    res.emit('finish');
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('should call next() and write an audit log on finish for a known route', async () => {
    const pool = makePool();
    const middleware = auditMiddleware(pool as never);
    const req = makeReq({
      method: 'GET',
      path: '/api/v1/credit-cards',
      route: { path: '/credit-cards' },
      user: { id: 'user-uuid', username: 'u', email: 'e', hasPan: true },
    }) as Request;
    const res = makeRes() as unknown as Response;
    middleware(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
    res.emit('finish');
    await new Promise((r) => setTimeout(r, 10));
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_logs'),
      expect.arrayContaining(['user-uuid', 'CARD_LIST']),
    );
  });

  it('should record USER_LOGIN_FAILED on 401 login response', async () => {
    const pool = makePool();
    const middleware = auditMiddleware(pool as never);
    const req = makeReq({
      method: 'POST',
      path: '/api/v1/auth/login',
      route: { path: '/auth/login' },
    }) as Request;
    const res = makeRes() as unknown as Response;
    res.statusCode = 401;
    middleware(req, res, mockNext);
    res.emit('finish');
    await new Promise((r) => setTimeout(r, 10));
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_logs'),
      expect.arrayContaining([null, 'USER_LOGIN_FAILED']),
    );
  });

  it('should not throw when pool.query rejects', async () => {
    const pool = makePool();
    pool.query.mockRejectedValueOnce(new Error('DB down'));
    const middleware = auditMiddleware(pool as never);
    const req = makeReq({
      method: 'GET',
      path: '/api/v1/credit-cards',
      route: { path: '/credit-cards' },
    }) as Request;
    const res = makeRes() as unknown as Response;
    middleware(req, res, mockNext);
    res.emit('finish');
    await new Promise((r) => setTimeout(r, 10));
    expect(mockNext).toHaveBeenCalled();
  });
});
