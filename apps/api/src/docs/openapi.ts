import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
  type ResponseConfig,
  type RouteConfig,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { i18next } from '../i18n';
import { buildLoginSchema, buildRegisterSchema } from '../routes/auth.routes';
import { buildPanSchema } from '../routes/pan.routes';
import { buildCardIdSchema } from '../routes/credit-cards.routes';
import { registerMailboxPaths } from './mailbox.openapi';

extendZodWithOpenApi(z);

export const BEARER_SCHEME = 'bearerAuth';

const JSON_CONTENT = 'application/json';

type OpenAPIObject = ReturnType<OpenApiGeneratorV3['generateDocument']>;

const buildOpenApiDocument = (lng: string): OpenAPIObject => {
  const t = (key: string): string => i18next.t(`apiDocs.${key}`, { lng });
  const registry = new OpenAPIRegistry();
  const bearer = [{ [BEARER_SCHEME]: [] }];

  registry.registerComponent('securitySchemes', BEARER_SCHEME, {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: t('security.bearer'),
  });

  const errorSchema = registry.register(
    'Error',
    z.object({ error: z.object({ code: z.string(), message: z.string() }) }),
  );

  const userSchema = registry.register(
    'User',
    z.object({
      id: z.string().uuid(),
      username: z.string(),
      email: z.string().email(),
      hasPan: z.boolean(),
    }),
  );

  const authResponseSchema = registry.register(
    'AuthResponse',
    z.object({
      accessToken: z.string().describe(t('schemas.accessToken')),
      user: userSchema,
    }),
  );

  const panProfileSchema = registry.register(
    'PanProfile',
    z.object({
      id: z.string().uuid(),
      panMasked: z.string().describe(t('schemas.panMasked')),
      verifiedAt: z.string().datetime().nullable(),
    }),
  );

  const cardStatementSchema = registry.register(
    'CardStatement',
    z.object({
      id: z.string().uuid(),
      statementDate: z.string().date(),
      dueDate: z.string().date().nullable().describe(t('schemas.dueDate')),
      totalAmountDue: z.number().describe(t('schemas.inrAmount')),
      minimumAmountDue: z.number().nullable().describe(t('schemas.inrAmount')),
      passwordHint: z.string().nullable().describe(t('schemas.passwordHint')),
      downloadAvailable: z.boolean().describe(t('schemas.downloadAvailable')),
    }),
  );

  const creditCardSchema = registry.register(
    'CreditCard',
    z.object({
      id: z.string().uuid(),
      cardNumberLast4: z.string().length(4).nullable().describe(t('schemas.cardNumberLast4')),
      cardName: z.string().nullable().describe(t('schemas.cardName')),
      cardNetwork: z.string().nullable(),
      issuingBank: z.string(),
      cardVariant: z.string(),
      expiryMonth: z.number().int().nullable(),
      expiryYear: z.number().int().nullable(),
      nameOnCard: z.string().nullable(),
      status: z.string(),
      creditLimit: z.number().nullable().describe(t('schemas.inrAmount')),
      availableCredit: z.number().nullable().describe(t('schemas.inrAmount')),
      currentBalance: z.number().nullable().describe(t('schemas.inrAmount')),
      billingCycleDay: z.number().int().nullable(),
      latestStatement: cardStatementSchema.nullable(),
      mailboxIds: z.array(z.string().uuid()).describe(t('schemas.cardMailboxIds')),
    }),
  );

  const currentUserSchema = registry.register(
    'CurrentUser',
    userSchema.extend({ panMasked: z.string().nullable().describe(t('schemas.panMasked')) }),
  );

  const json = (description: string, schema: z.ZodTypeAny): ResponseConfig => ({
    description,
    content: { [JSON_CONTENT]: { schema } },
  });
  const error = (key: string): ResponseConfig => json(t(`responses.${key}`), errorSchema);
  const body = (schema: z.ZodTypeAny): Pick<NonNullable<RouteConfig['request']>, 'body'> => ({
    body: { required: true, content: { [JSON_CONTENT]: { schema } } },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/register',
    tags: [t('tags.auth')],
    summary: t('operations.register'),
    request: body(buildRegisterSchema(lng)),
    responses: {
      201: json(t('responses.created'), authResponseSchema),
      409: error('conflict'),
      422: error('validation'),
      429: error('rateLimited'),
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/login',
    tags: [t('tags.auth')],
    summary: t('operations.login'),
    description: t('operations.loginDescription'),
    request: body(buildLoginSchema(lng)),
    responses: {
      200: json(t('responses.ok'), authResponseSchema),
      401: error('invalidCredentials'),
      422: error('validation'),
      429: error('rateLimited'),
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/v1/auth/logout',
    tags: [t('tags.auth')],
    summary: t('operations.logout'),
    description: t('operations.logoutDescription'),
    responses: {
      204: { description: t('responses.noContent') },
      401: error('unauthorized'),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/users/me',
    tags: [t('tags.users')],
    summary: t('operations.getMe'),
    security: bearer,
    responses: {
      200: json(t('responses.ok'), currentUserSchema),
      401: error('unauthorized'),
      404: error('notFound'),
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/pan/register',
    tags: [t('tags.pan')],
    summary: t('operations.registerPan'),
    security: bearer,
    request: body(buildPanSchema(lng)),
    responses: {
      201: json(t('responses.created'), panProfileSchema),
      400: error('badRequest'),
      401: error('unauthorized'),
      409: error('conflict'),
      422: error('validation'),
      429: error('rateLimited'),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/pan',
    tags: [t('tags.pan')],
    summary: t('operations.getPan'),
    security: bearer,
    responses: {
      200: json(t('responses.ok'), panProfileSchema),
      401: error('unauthorized'),
      404: error('notFound'),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/credit-cards',
    tags: [t('tags.creditCards')],
    summary: t('operations.listCreditCards'),
    security: bearer,
    responses: {
      200: json(t('responses.ok'), z.object({ cards: z.array(creditCardSchema) })),
      401: error('unauthorized'),
      403: error('panNotRegistered'),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/credit-cards/{cardId}/statements',
    tags: [t('tags.creditCards')],
    summary: t('operations.getCardStatements'),
    description: t('operations.getCardStatementsDescription'),
    security: bearer,
    request: { params: buildCardIdSchema(lng) },
    responses: {
      200: json(
        t('responses.ok'),
        z.object({ card: creditCardSchema, statements: z.array(cardStatementSchema) }),
      ),
      401: error('unauthorized'),
      403: error('panNotRegistered'),
      404: error('notFound'),
      422: error('validation'),
    },
  });

  registerMailboxPaths(registry, { t, json, error, body, bearer }, lng);

  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.3',
    info: { title: t('title'), version: '1.0.0', description: t('description') },
  });
};

const documentCache = new Map<string, OpenAPIObject>();

export const getOpenApiDocument = (lng: string): OpenAPIObject => {
  const cached = documentCache.get(lng);
  if (cached) return cached;

  const document = buildOpenApiDocument(lng);
  documentCache.set(lng, document);
  return document;
};
