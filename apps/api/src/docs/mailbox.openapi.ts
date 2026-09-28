import type { OpenAPIRegistry, ResponseConfig, RouteConfig } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  CALLBACK_PROVIDERS,
  buildEmailSchema,
  buildMailboxIdSchema,
  callbackQuerySchema,
} from '../routes/mailboxes.routes';

const MAILBOXES_PATH = '/api/v1/mailboxes';

/** Shared builders from openapi.ts, so every section renders errors and bodies the same way. */
export interface DocHelpers {
  readonly t: (key: string) => string;
  readonly json: (description: string, schema: z.ZodTypeAny) => ResponseConfig;
  readonly error: (key: string) => ResponseConfig;
  readonly body: (schema: z.ZodTypeAny) => Pick<NonNullable<RouteConfig['request']>, 'body'>;
  readonly bearer: RouteConfig['security'];
}

const registerSchemas = (
  registry: OpenAPIRegistry,
  t: DocHelpers['t'],
): { summary: z.ZodTypeAny; resolution: z.ZodTypeAny } => {
  const provider = z.enum(['GOOGLE', 'MICROSOFT']);
  const summary = registry.register(
    'Mailbox',
    z.object({
      id: z.string().uuid(),
      provider,
      emailMasked: z.string().describe(t('schemas.emailMasked')),
      status: z.enum(['ACTIVE', 'REAUTH_REQUIRED']),
      lastSyncStatus: z.enum(['NEVER', 'RUNNING', 'SUCCEEDED', 'FAILED']),
      lastSyncErrorCode: z.string().nullable(),
      lastSyncedAt: z.string().datetime().nullable(),
      createdAt: z.string().datetime(),
    }),
  );
  const resolution = registry.register(
    'MailboxResolution',
    z.discriminatedUnion('supported', [
      z.object({ supported: z.literal(true), provider, authType: z.literal('OAUTH') }),
      z.object({ supported: z.literal(false), reason: z.literal('PROVIDER_NOT_SUPPORTED') }),
    ]),
  );
  return { summary, resolution };
};

interface DocContext {
  readonly registry: OpenAPIRegistry;
  readonly h: DocHelpers;
  readonly lng: string;
  readonly tags: string[];
}

type Responses = RouteConfig['responses'];

/** Errors shared by resolve and connect: both check the PAN, existing links and a rate limit. */
const linkErrors = (h: DocHelpers): Responses => ({
  401: h.error('unauthorized'),
  403: h.error('panNotRegistered'),
  409: h.error('mailboxAlreadyLinked'),
  429: h.error('rateLimited'),
});

/** Errors shared by the routes that act on one of the caller's mailboxes. */
const ownedMailboxErrors = (h: DocHelpers): Responses => ({
  401: h.error('unauthorized'),
  403: h.error('panNotRegistered'),
  404: h.error('notFound'),
  422: h.error('validation'),
});

const registerResolvePath = (
  { registry, h, lng, tags }: DocContext,
  resolution: z.ZodTypeAny,
): void => {
  registry.registerPath({
    method: 'post',
    path: `${MAILBOXES_PATH}/resolve`,
    tags,
    summary: h.t('operations.resolveMailbox'),
    security: h.bearer,
    request: h.body(buildEmailSchema(lng)),
    responses: {
      200: h.json(h.t('responses.ok'), resolution),
      ...linkErrors(h),
      422: h.error('validation'),
    },
  });
};

const registerConnectPath = ({ registry, h, lng, tags }: DocContext): void => {
  registry.registerPath({
    method: 'post',
    path: `${MAILBOXES_PATH}/connect`,
    tags,
    summary: h.t('operations.connectMailbox'),
    description: h.t('operations.connectMailboxDescription'),
    security: h.bearer,
    request: h.body(buildEmailSchema(lng)),
    responses: {
      200: h.json(h.t('responses.ok'), z.object({ authUrl: z.string().url() })),
      ...linkErrors(h),
      422: h.error('mailboxNotLinkable'),
    },
  });
};

/** Public: the provider redirects the browser here; the cookie set by /connect binds it. */
const registerCallbackPath = ({ registry, h, tags }: DocContext): void => {
  registry.registerPath({
    method: 'get',
    path: `${MAILBOXES_PATH}/oauth/callback/{provider}`,
    tags,
    summary: h.t('operations.mailboxOAuthCallback'),
    description: h.t('operations.mailboxOAuthCallbackDescription'),
    request: {
      params: z.object({ provider: z.string().openapi({ enum: Object.keys(CALLBACK_PROVIDERS) }) }),
      query: callbackQuerySchema,
    },
    responses: { 302: { description: h.t('responses.oauthRedirect') } },
  });
};

const registerListPath = ({ registry, h, tags }: DocContext, summary: z.ZodTypeAny): void => {
  registry.registerPath({
    method: 'get',
    path: MAILBOXES_PATH,
    tags,
    summary: h.t('operations.listMailboxes'),
    security: h.bearer,
    responses: {
      200: h.json(h.t('responses.ok'), z.object({ mailboxes: z.array(summary) })),
      401: h.error('unauthorized'),
      403: h.error('panNotRegistered'),
    },
  });
};

const registerSyncPath = ({ registry, h, lng, tags }: DocContext): void => {
  registry.registerPath({
    method: 'post',
    path: `${MAILBOXES_PATH}/{mailboxId}/sync`,
    tags,
    summary: h.t('operations.syncMailbox'),
    security: h.bearer,
    request: { params: buildMailboxIdSchema(lng) },
    responses: {
      202: h.json(h.t('responses.syncQueued'), z.object({ queued: z.literal(true) })),
      ...ownedMailboxErrors(h),
      409: h.error('mailboxReauthRequired'),
      429: h.error('syncTooFrequent'),
    },
  });
};

const registerUnlinkPath = ({ registry, h, lng, tags }: DocContext): void => {
  registry.registerPath({
    method: 'delete',
    path: `${MAILBOXES_PATH}/{mailboxId}`,
    tags,
    summary: h.t('operations.unlinkMailbox'),
    security: h.bearer,
    request: { params: buildMailboxIdSchema(lng) },
    responses: {
      204: { description: h.t('responses.mailboxUnlinked') },
      ...ownedMailboxErrors(h),
    },
  });
};

export const registerMailboxPaths = (
  registry: OpenAPIRegistry,
  helpers: DocHelpers,
  lng: string,
): void => {
  const ctx: DocContext = { registry, h: helpers, lng, tags: [helpers.t('tags.mailboxes')] };
  const { summary, resolution } = registerSchemas(registry, helpers.t);
  registerResolvePath(ctx, resolution);
  registerConnectPath(ctx);
  registerCallbackPath(ctx);
  registerListPath(ctx, summary);
  registerSyncPath(ctx);
  registerUnlinkPath(ctx);
};
