import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import { z } from 'zod';
import pino from 'pino';
import { getAuthUser, requireAuth } from '../middleware/auth.middleware';
import {
  mailboxCallbackRateLimiter,
  mailboxConnectRateLimiter,
  mailboxResolveRateLimiter,
} from '../middleware/rateLimit.middleware';
import { errorLoggerOptions } from '../middleware/error.middleware';
import { i18next } from '../i18n';
import {
  MailboxLinkError,
  type CallbackInput,
  type MailboxLinkErrorCode,
  type MailboxService,
  type RequestContext,
} from '../services/mailbox/mailbox.service';
import { errorName } from '../services/mailbox/mailbox-link';
import type { ProviderKey } from '../services/mailbox/providers/mail-provider';

const logger = pino({ ...errorLoggerOptions, name: 'mailboxes-routes' });

const MAX_EMAIL_LENGTH = 254;
const HTTP_ACCEPTED = 202;
const HTTP_NO_CONTENT = 204;
const HTTP_FOUND = 302;
const LINKED_EMAIL_PAGE = '/linked-email';
const LINK_FAILED: MailboxLinkErrorCode = 'MAILBOX_LINK_FAILED';
const LINKED_FLAG = '1';
const MS_PER_MINUTE = 60 * 1000;
const OAUTH_STATE_COOKIE = 'mf_mailbox_oauth';
export const OAUTH_STATE_COOKIE_PATH = '/api/v1/mailboxes/oauth';
const OAUTH_STATE_COOKIE_MAX_AGE_MS = 10 * MS_PER_MINUTE;

/** Lower-case provider segments of the OAuth redirect URI (see buildRedirectUri). */
export const CALLBACK_PROVIDERS: Readonly<Record<string, ProviderKey>> = {
  google: 'GOOGLE',
  microsoft: 'MICROSOFT',
};

export interface MailboxModule {
  service: Pick<
    MailboxService,
    'resolve' | 'startConnect' | 'completeConnect' | 'list' | 'requestSync' | 'unlink'
  >;
  appBaseUrl: string;
}

type MailboxRouteService = MailboxModule['service'];

export const buildEmailSchema = (lng: string): z.ZodObject<{ email: z.ZodString }> => {
  const invalid = i18next.t('validation.email_invalid', { lng });
  return z.object({
    email: z
      .string({ required_error: i18next.t('validation.email_required', { lng }) })
      .trim()
      .max(MAX_EMAIL_LENGTH, invalid)
      .email(invalid),
  });
};

export const buildMailboxIdSchema = (lng: string): z.ZodObject<{ mailboxId: z.ZodString }> =>
  z.object({
    mailboxId: z.string().uuid(i18next.t('validation.mailbox_id_invalid', { lng })),
  });

/**
 * Each value must be a single string, so repeated parameters fail validation. Not strict:
 * providers append their own parameters (scope, iss, session_state), which are stripped.
 */
export const callbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

const contextOf = (req: Request): RequestContext => ({
  userId: getAuthUser(req).id,
  lng: req.language,
  ip: req.ip ?? null,
});

/** Parses the provider redirect; null means the request is malformed and linking fails. */
const parseCallback = (req: Request): CallbackInput | null => {
  const segment = req.params['provider'] ?? '';
  // Own-property check: inherited keys such as __proto__ or constructor are not providers.
  const provider = Object.hasOwn(CALLBACK_PROVIDERS, segment)
    ? CALLBACK_PROVIDERS[segment]
    : undefined;
  const query = callbackQuerySchema.safeParse(req.query);
  if (!provider || !query.success) return null;
  const cookies = req.cookies as Record<string, string | undefined>;
  return {
    provider,
    code: query.data.code,
    state: query.data.state,
    browserState: cookies[OAUTH_STATE_COOKIE],
    error: query.data.error,
    errorDescription: query.data.error_description,
  };
};

const linkErrorCode = (err: unknown): MailboxLinkErrorCode => {
  if (err instanceof MailboxLinkError) return err.code;
  logger.error({ errName: errorName(err) }, 'mailbox callback failed');
  return LINK_FAILED;
};

/**
 * OAuth redirect target, so no JWT: the user comes from the server-side state, which must also
 * match the HttpOnly cookie set by /connect in this browser (SameSite=Lax is sent on this GET).
 */
const callbackHandler = (mailbox: MailboxModule): RequestHandler => {
  const redirectToPage = (res: Response, params: Record<string, string>): void => {
    const query = new URLSearchParams(params).toString();
    res.redirect(HTTP_FOUND, `${mailbox.appBaseUrl}${LINKED_EMAIL_PAGE}?${query}`);
  };

  return async (req: Request, res: Response): Promise<void> => {
    const input = parseCallback(req);
    res.clearCookie(OAUTH_STATE_COOKIE, { path: OAUTH_STATE_COOKIE_PATH });
    if (!input) {
      redirectToPage(res, { error: LINK_FAILED });
      return;
    }
    try {
      await mailbox.service.completeConnect(input);
      redirectToPage(res, { linked: LINKED_FLAG });
    } catch (err) {
      redirectToPage(res, { error: linkErrorCode(err) });
    }
  };
};

const resolveHandler =
  (service: MailboxRouteService): RequestHandler =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email } = buildEmailSchema(req.language).parse(req.body);
      res.json(await service.resolve(contextOf(req), email));
    } catch (err) {
      next(err);
    }
  };

const connectHandler =
  (service: MailboxRouteService): RequestHandler =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email } = buildEmailSchema(req.language).parse(req.body);
      const { authUrl, state } = await service.startConnect(contextOf(req), email);
      res.cookie(OAUTH_STATE_COOKIE, state, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env['NODE_ENV'] === 'production',
        path: OAUTH_STATE_COOKIE_PATH,
        maxAge: OAUTH_STATE_COOKIE_MAX_AGE_MS,
      });
      res.json({ authUrl });
    } catch (err) {
      next(err);
    }
  };

const listHandler =
  (service: MailboxRouteService): RequestHandler =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({ mailboxes: await service.list(contextOf(req)) });
    } catch (err) {
      next(err);
    }
  };

const syncHandler =
  (service: MailboxRouteService): RequestHandler =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { mailboxId } = buildMailboxIdSchema(req.language).parse(req.params);
      await service.requestSync(contextOf(req), mailboxId);
      res.status(HTTP_ACCEPTED).json({ queued: true });
    } catch (err) {
      next(err);
    }
  };

const unlinkHandler =
  (service: MailboxRouteService): RequestHandler =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { mailboxId } = buildMailboxIdSchema(req.language).parse(req.params);
      await service.unlink(contextOf(req), mailboxId);
      res.status(HTTP_NO_CONTENT).end();
    } catch (err) {
      next(err);
    }
  };

/**
 * Rate limiters run after requireAuth because they are keyed by the authenticated user.
 * The callback has no JWT, so its limiter falls back to the client IP.
 */
export const mailboxesRouter = (mailbox: MailboxModule): Router => {
  const router = Router();
  const { service } = mailbox;

  router.get('/oauth/callback/:provider', mailboxCallbackRateLimiter, callbackHandler(mailbox));
  router.post('/resolve', requireAuth, mailboxResolveRateLimiter, resolveHandler(service));
  router.post('/connect', requireAuth, mailboxConnectRateLimiter, connectHandler(service));
  router.get('/', requireAuth, listHandler(service));
  router.post('/:mailboxId/sync', requireAuth, syncHandler(service));
  router.delete('/:mailboxId', requireAuth, unlinkHandler(service));

  return router;
};
