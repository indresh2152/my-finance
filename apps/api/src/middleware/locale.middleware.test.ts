import type { Request, Response, NextFunction } from 'express';
import { localeMiddleware } from './locale.middleware';

const mockNext = jest.fn() as jest.MockedFunction<NextFunction>;

const makeReq = (acceptLanguage?: string): Partial<Request> => ({
  headers: acceptLanguage ? { 'accept-language': acceptLanguage } : {},
});

afterEach(() => jest.clearAllMocks());

describe('localeMiddleware', () => {
  it('should set req.language to "en" when Accept-Language is missing', () => {
    const req = makeReq() as Request;
    localeMiddleware(req, {} as Response, mockNext);
    expect(req.language).toBe('en');
    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it('should set req.language to "en" for an English header', () => {
    const req = makeReq('en-US,en;q=0.9') as Request;
    localeMiddleware(req, {} as Response, mockNext);
    expect(req.language).toBe('en');
  });

  it('should fall back to "en" for an unsupported language', () => {
    const req = makeReq('fr-FR') as Request;
    localeMiddleware(req, {} as Response, mockNext);
    expect(req.language).toBe('en');
  });

  it('should call next() without arguments', () => {
    const req = makeReq('en') as Request;
    localeMiddleware(req, {} as Response, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
  });
});
