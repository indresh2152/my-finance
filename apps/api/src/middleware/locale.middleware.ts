import type { Request, Response, NextFunction } from 'express';
import i18next from 'i18next';

declare module 'express-serve-static-core' {
  interface Request {
    language: string;
  }
}

export const localeMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  const acceptLanguage = req.headers['accept-language'] ?? 'en';
  const requested = acceptLanguage.split(',')[0]?.split('-')[0]?.toLowerCase() ?? 'en';
  const supported = (i18next.options.supportedLngs as string[]) ?? ['en'];
  req.language = supported.includes(requested) ? requested : 'en';
  next();
};
