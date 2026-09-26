import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import type { Request, Response } from 'express';
import { i18next } from '../i18n';

const HOUR_MS = 60 * 60 * 1000;
const TOO_MANY_REQUESTS = 429;

const makeRateLimiter = (windowMs: number, max: number, message: string): RateLimitRequestHandler =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMIT_EXCEEDED', message } },
  });

export const loginRateLimiter = makeRateLimiter(
  60 * 1000,
  5,
  'Too many login attempts. Try again in a minute.',
);

export const registerRateLimiter = makeRateLimiter(
  60 * 60 * 1000,
  10,
  'Too many registration attempts. Try again later.',
);

export const panRateLimiter = makeRateLimiter(
  24 * 60 * 60 * 1000,
  3,
  'Too many PAN registration attempts. Try again tomorrow.',
);

/** Keyed by authenticated user id (falls back to IP); place after requireAuth. */
export const makeUserRateLimiter = (windowMs: number, max: number): RateLimitRequestHandler =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request): string => req.user?.id ?? req.ip ?? 'anonymous',
    handler: (req: Request, res: Response): void => {
      res.status(TOO_MANY_REQUESTS).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: i18next.t('error.rate_limit_exceeded', { lng: req.language ?? 'en' }),
        },
      });
    },
  });

export const mailboxResolveRateLimiter = makeUserRateLimiter(HOUR_MS, 30);
export const mailboxConnectRateLimiter = makeUserRateLimiter(HOUR_MS, 10);
