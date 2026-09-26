import type { Request, Response, NextFunction } from 'express';
import { authMiddleware, getAuthUser, requireAuth } from './auth.middleware';
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

  it('should pass an INVALID_TOKEN AppError to next() when token is invalid', () => {
    const req = makeReq('invalid.jwt.token') as Request;
    authMiddleware(SECRET)(req, makeRes() as Response, mockNext);
    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_TOKEN', status: 401 }),
    );
  });
});

describe('requireAuth', () => {
  it('should call next() when req.user is set', () => {
    const req = {
      user: { id: '1', username: 'u', email: 'e', hasPan: false },
      language: 'en',
    } as unknown as Request;
    requireAuth(req, {} as Response, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
  });

  it('should pass a 401 AppError to next() when req.user is not set', () => {
    const req = { language: 'en' } as Request;
    requireAuth(req, {} as Response, mockNext);
    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'UNAUTHORIZED', status: 401 }),
    );
  });
});

describe('getAuthUser', () => {
  it('should return req.user when it is set', () => {
    const user = { id: '1', username: 'u', email: 'e', hasPan: false };
    const req = { user, language: 'en' } as unknown as Request;
    expect(getAuthUser(req)).toBe(user);
  });

  it('should throw a 401 AppError when req.user is not set', () => {
    const req = { language: 'en' } as Request;
    expect(() => getAuthUser(req)).toThrow(
      expect.objectContaining({ code: 'UNAUTHORIZED', status: 401 }),
    );
  });
});
