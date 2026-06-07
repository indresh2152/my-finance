import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { AuthService } from '../services/auth.service';
import { loginRateLimiter, registerRateLimiter } from '../middleware/rateLimit.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import { i18next } from '../i18n';

const COOKIE_NAME = 'refreshToken';
const COOKIE_PATH = '/api/v1/auth/refresh';

const getCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env['NODE_ENV'] === 'production',
  path: COOKIE_PATH,
});

const buildRegisterSchema = (lng: string): z.ZodObject<{
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

const buildLoginSchema = (lng: string): z.ZodObject<{
  username: z.ZodString;
  password: z.ZodString;
}> =>
  z.object({
    username: z.string({ required_error: i18next.t('validation.username_required', { lng }) }).min(1),
    password: z.string({ required_error: i18next.t('validation.password_required', { lng }) }).min(1),
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
        const { tokens, user } = await service.register(body.username, body.email, body.password, req.language);
        res.cookie(COOKIE_NAME, tokens.refreshToken, getCookieOptions());
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
        res.cookie(COOKIE_NAME, tokens.refreshToken, getCookieOptions());
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
          res.status(401).json({
            error: {
              code: 'REFRESH_TOKEN_INVALID',
              message: i18next.t('error.refresh_token_invalid', { lng: req.language }),
            },
          });
          return;
        }

        const tokens = await service.refresh(rawToken, req.language);
        res.cookie(COOKIE_NAME, tokens.refreshToken, getCookieOptions());
        res.json({ accessToken: tokens.accessToken });
      } catch (err) {
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

        res.clearCookie(COOKIE_NAME, { path: COOKIE_PATH });
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
};
