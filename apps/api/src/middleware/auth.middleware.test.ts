import type { Request, Response, NextFunction } from 'express';
import { authMiddleware, requireAuth } from './auth.middleware';
import { signAccessToken } from '../utils/token.utils';
import type { AccessTokenPayload } from '../utils/token.utils';

const SECRET = 'test-jwt-secret-at-least-32-chars!!';

const PAYLOAD: AccessTokenPayload = {
  userId: '550e8400-e29b-41d4-a716-446655440000',
  username: 'testuser',
  email: 'test@example.com',
  hasPan: false,
};

const makeReq = (token?: string): Partial<Request> => ({
  headers: token ? { authorization: `Bearer ${token}` } : {},
  language: 'en',
});

const makeRes = (): Partial<Response> => {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockNext = jest.fn() as jest.MockedFunction<NextFunction>;

afterEach(() => jest.clearAllMocks());

describe('authMiddleware', () => {
  it('should call next() without setting req.user when no token is provided', () => {
    const req = makeReq() as Request;
    authMiddleware(SECRET)(req, makeRes() as Response, mockNext);
    expect(req.user).toBeUndefined();
    expect(mockNext).toHaveBeenCalledWith();
  });

  it('should set req.user when a valid token is provided', () => {
    const token = signAccessToken(PAYLOAD, SECRET);
    const req = makeReq(token) as Request;
    authMiddleware(SECRET)(req, makeRes() as Response, mockNext);
    expect(req.user).toMatchObject({
      id: PAYLOAD.userId,
      username: PAYLOAD.username,
      email: PAYLOAD.email,
      hasPan: false,
    });
    expect(mockNext).toHaveBeenCalledWith();
  });

  it('should return 401 when token is invalid', () => {
    const req = makeReq('invalid.jwt.token') as Request;
    const res = makeRes() as Response;
    authMiddleware(SECRET)(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'INVALID_TOKEN' }) }),
    );
    expect(mockNext).not.toHaveBeenCalled();
  });
});

describe('requireAuth', () => {
  it('should call next() when req.user is set', () => {
    const req = { user: { id: '1', username: 'u', email: 'e', hasPan: false }, language: 'en' } as unknown as Request;
    requireAuth(req, makeRes() as Response, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
  });

  it('should return 401 when req.user is not set', () => {
    const req = { language: 'en' } as Request;
    const res = makeRes() as Response;
    requireAuth(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'UNAUTHORIZED' }) }),
    );
  });
});
