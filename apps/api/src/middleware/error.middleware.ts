import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import pino from 'pino';
import i18next from 'i18next';

const logger = pino({ name: 'error' });

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const errorMiddleware = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const lng = req.language ?? 'en';

  if (err instanceof ZodError) {
    res.status(422).json({ error: { code: 'VALIDATION_ERROR', fields: err.flatten() } });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }

  logger.error({ err, requestId: req.headers['x-request-id'] }, 'Unhandled error');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: i18next.t('error.internal', { lng }),
    },
  });
};
