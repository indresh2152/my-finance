import rateLimit from 'express-rate-limit';

const makeRateLimiter = (windowMs: number, max: number, message: string) =>
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
