import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/token.utils';
import i18next from 'i18next';

declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      id: string;
      username: string;
      email: string;
      hasPan: boolean;
    };
  }
}

export const authMiddleware =
  (jwtSecret: string) =>
  (req: Request, res: Response, next: NextFunction): void => {
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
      res.status(401).json({
        error: {
          code: 'INVALID_TOKEN',
          message: i18next.t('error.unauthorized', { lng: req.language ?? 'en' }),
        },
      });
    }
  };

export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: i18next.t('error.unauthorized', { lng: req.language ?? 'en' }),
      },
    });
    return;
  }
  next();
};
