import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { errorMiddleware, AppError } from './error.middleware';

const makeReq = (): Partial<Request> => ({ language: 'en', headers: {} });

const makeRes = (): Partial<Response> => {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockNext = jest.fn() as jest.MockedFunction<NextFunction>;

afterEach(() => jest.clearAllMocks());

describe('errorMiddleware', () => {
  it('should return 422 with field errors for a ZodError', () => {
    const schema = z.object({ name: z.string() });
    let zodError: z.ZodError | null = null;
    try { schema.parse({}); } catch (e) { zodError = e as z.ZodError; }

    const res = makeRes() as Response;
    errorMiddleware(zodError!, makeReq() as Request, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'VALIDATION_ERROR' }) }),
    );
  });

  it('should return the AppError status and code', () => {
    const err = new AppError('PAN_INVALID', 400, 'PAN is invalid');
    const res = makeRes() as Response;
    errorMiddleware(err, makeReq() as Request, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'PAN_INVALID', message: 'PAN is invalid' },
    });
  });

  it('should return 500 with INTERNAL_ERROR code for unknown errors', () => {
    const res = makeRes() as Response;
    errorMiddleware(new Error('something broke'), makeReq() as Request, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'INTERNAL_ERROR' }) }),
    );
  });
});
