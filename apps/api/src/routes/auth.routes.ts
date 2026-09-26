import {
  Router,
  type CookieOptions,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { AuthService } from '../services/auth.service';
import { loginRateLimiter, registerRateLimiter } from '../middleware/rateLimit.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import { AppError } from '../middleware/error.middleware';
import { i18next } from '../i18n';
import { REFRESH_TOKEN_TTL_MS } from '../utils/token.utils';

const COOKIE_NAME = 'refreshToken';
// Scoped to /auth so both /refresh and /logout receive it.
const COOKIE_PATH = '/api/v1/auth';
// Cookies issued before the path widened. Browsers send both cookies to /refresh
// (the legacy one first), so it must be cleared whenever the new cookie is set.
// Legacy cookies were session cookies (no Max-Age), which browsers with session
// restore can keep indefinitely, so this clearing must stay until that risk is accepted.
const LEGACY_COOKIE_PATH = '/api/v1/auth/refresh';

const getCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env['NODE_ENV'] === 'production',
  path: COOKIE_PATH,
  // Expire with the token, so a revoked or expired token is never resent indefinitely.
  maxAge: REFRESH_TOKEN_TTL_MS,
});

const clearLegacyRefreshCookie = (res: Response): void => {
  res.clearCookie(COOKIE_NAME, { path: LEGACY_COOKIE_PATH });
};

const setRefreshCookie = (res: Response, refreshToken: string): void => {
  clearLegacyRefreshCookie(res);
  res.cookie(COOKIE_NAME, refreshToken, getCookieOptions());
};

const clearRefreshCookies = (res: Response): void => {
  clearLegacyRefreshCookie(res);
  res.clearCookie(COOKIE_NAME, { path: COOKIE_PATH });
};

export const buildRegisterSchema = (
  lng: string,
): z.ZodObject<{
  username: z.ZodString;
  email: z.ZodString;
  password: z.ZodString;
}> =>
  z.object({
    username: z
      .string({ required_error: i18next.t('validation.username_required', { lng }) })
      .min(3)
      .max(50)
      .regex(/^[a-zA-Z0-9_]+$/),
    email: z
      .string({ required_error: i18next.t('validation.email_required', { lng }) })
      .email(i18next.t('validation.email_invalid', { lng })),
    password: z
      .string({ required_error: i18next.t('validation.password_required', { lng }) })
      .min(8, i18next.t('validation.password_min', { lng }))
      .regex(
        /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/,
        i18next.t('validation.password_complexity', { lng }),
      ),
  });

export const buildLoginSchema = (
  lng: string,
): z.ZodObject<{
  username: z.ZodString;
  password: z.ZodString;
}> =>
  z.object({
    username: z
      .string({ required_error: i18next.t('validation.username_required', { lng }) })
      .min(1),
    password: z
      .string({ required_error: i18next.t('validation.password_required', { lng }) })
      .min(1),
  });

export const authRouter = (deps: AppDeps): Router => {
  const router = Router();
  const service = new AuthService(deps.db, deps.jwtSecret, deps.refreshTokenSecret);

  router.post(
    '/register',
    registerRateLimiter,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const body = buildRegisterSchema(req.language).parse(req.body);
        const { tokens, user } = await service.register(
          body.username,
          body.email,
          body.password,
          req.language,
        );
        setRefreshCookie(res, tokens.refreshToken);
        res.status(201).json({ accessToken: tokens.accessToken, user });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/login',
    loginRateLimiter,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const body = buildLoginSchema(req.language).parse(req.body);
        const { tokens, user } = await service.login(
          body.username,
          body.password,
          req.language,
          req.headers['user-agent'],
          req.ip,
        );
        setRefreshCookie(res, tokens.refreshToken);
        res.json({ accessToken: tokens.accessToken, user });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/refresh',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const rawToken = (req.cookies as Record<string, string | undefined>)[COOKIE_NAME];

        if (!rawToken) {
          throw new AppError(
            'REFRESH_TOKEN_INVALID',
            401,
            i18next.t('error.refresh_token_invalid', { lng: req.language }),
          );
        }

        const tokens = await service.refresh(rawToken, req.language);
        setRefreshCookie(res, tokens.refreshToken);
        res.json({ accessToken: tokens.accessToken });
      } catch (err) {
        // A rejected token is dead: drop it so the browser stops resending it.
        if (err instanceof AppError && err.status === 401) clearRefreshCookies(res);
        next(err);
      }
    },
  );

  router.delete(
    '/logout',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const rawToken = (req.cookies as Record<string, string | undefined>)[COOKIE_NAME];

        if (rawToken) {
          await service.logout(rawToken);
        }

        clearRefreshCookies(res);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
};
