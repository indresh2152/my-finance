import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/token.utils';
import i18next from 'i18next';
import { AppError } from './error.middleware';

export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string;
  hasPan: boolean;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthenticatedUser;
  }
}

const unauthorizedError = (req: Request): AppError =>
  new AppError('UNAUTHORIZED', 401, i18next.t('error.unauthorized', { lng: req.language ?? 'en' }));

/**
 * Returns the authenticated user for a route guarded by `requireAuth`.
 * Throws a 401 AppError instead of asserting, so a missing guard fails safely.
 */
export const getAuthUser = (req: Request): AuthenticatedUser => {
  if (!req.user) throw unauthorizedError(req);
  return req.user;
};

export const authMiddleware =
  (jwtSecret: string) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const authHeader = req.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.slice(7);

    try {
      const payload = verifyAccessToken(token, jwtSecret);
      req.user = {
        id: payload.userId,
        username: payload.username,
        email: payload.email,
        hasPan: payload.hasPan,
      };
      next();
    } catch {
      next(
        new AppError(
          'INVALID_TOKEN',
          401,
          i18next.t('error.unauthorized', { lng: req.language ?? 'en' }),
        ),
      );
    }
  };

export const requireAuth = (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.user) {
    next(unauthorizedError(req));
    return;
  }
  next();
};
