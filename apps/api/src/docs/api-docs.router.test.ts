import request from 'supertest';
import express, { Router, type Express } from 'express';
import { createApp, type AppDeps } from '../app';
import { getOpenApiDocument, BEARER_SCHEME } from './openapi';
import { OPENAPI_SPEC_PATH } from './api-docs.router';
import { withEnv } from '../test/with-env';

const deps: AppDeps = {
  db: { query: jest.fn() } as never,
  jwtSecret: 'test-jwt-secret-at-least-32-chars!!',
  refreshTokenSecret: 'test-refresh-secret-32-chars-min!!',
  panHmacSecret: 'test-pan-hmac-secret-32-chars-min!',
  panVerifier: { verify: jest.fn() } as never,
  // Mounts the feature-flagged mailbox routes so the drift test sees them; no handler runs.
  mailbox: {
    service: {} as never,
    statements: {} as never,
    appBaseUrl: 'https://app.example',
  },
};

/** Cookie-authenticated routes are intentionally not exposed: the docs are bearer-only. */
const UNDOCUMENTED_ROUTES = new Set(['post /api/v1/auth/refresh']);

const API_PREFIX = '/api/v1';

interface Layer {
  regexp: RegExp;
  route?: { path: unknown; methods: Record<string, boolean> };
  handle: { stack?: Layer[] };
}

/** Express 4 keeps only a compiled regexp for a mount path, e.g. `^\/api\/v1\/pan\/?(?=\/|$)`. */
const MOUNT_REGEXP_SOURCE = /^\^((?:\\\/[\w-]+)*)\\\/\?\(\?=\\\/\|\$\)$/;

const mountPath = (layer: Layer): string => {
  const match = MOUNT_REGEXP_SOURCE.exec(layer.regexp.source);
  if (!match) throw new Error(`Cannot read router mount path from /${layer.regexp.source}/`);
  return (match[1] ?? '').replace(/\\\//g, '/');
};

const collectRoutes = (stack: Layer[], prefix: string): string[] =>
  stack.flatMap((layer) => {
    if (layer.route) {
      const { path, methods } = layer.route;
      if (typeof path !== 'string') throw new Error(`Unsupported route path under ${prefix}`);
      // OpenAPI writes path params as {id}; Express writes them as :id.
      const fullPath = `${prefix}${path}`.replace(/\/$/, '').replace(/:(\w+)/g, '{$1}');
      return Object.keys(methods).map((method) => `${method} ${fullPath}`);
    }
    if (layer.handle.stack) {
      return collectRoutes(layer.handle.stack, `${prefix}${mountPath(layer)}`);
    }
    return [];
  });

/**
 * Every `/api/v1` route the app actually serves, found by walking its router stack.
 * Relies on Express 4 internals (`app._router`, `layer.regexp`): rewrite on the Express 5 upgrade.
 */
const listApiRoutes = (app: Express): string[] =>
  collectRoutes((app as unknown as { _router: { stack: Layer[] } })._router.stack, '').filter(
    (route) => route.includes(` ${API_PREFIX}/`),
  );

describe('API docs mounting', () => {
  it(
    'should not expose docs when API_DOCS_ENABLED is unset',
    withEnv({ API_DOCS_ENABLED: undefined }, async () => {
      const res = await request(createApp(deps)).get(OPENAPI_SPEC_PATH);
      expect(res.status).toBe(404);
    }),
  );

  it(
    'should not expose docs when API_DOCS_ENABLED is not exactly "true"',
    withEnv({ API_DOCS_ENABLED: '1' }, async () => {
      const res = await request(createApp(deps)).get(OPENAPI_SPEC_PATH);
      expect(res.status).toBe(404);
    }),
  );

  it(
    'should serve the OpenAPI spec when enabled',
    withEnv({ API_DOCS_ENABLED: 'true' }, async () => {
      const res = await request(createApp(deps)).get(OPENAPI_SPEC_PATH);
      expect(res.status).toBe(200);
      expect(res.body.openapi).toBe('3.0.3');
      expect(res.body.paths['/api/v1/credit-cards']).toBeDefined();
    }),
  );

  it(
    'should serve the Swagger UI page pointing at the spec, without persisting tokens',
    withEnv({ API_DOCS_ENABLED: 'true' }, async () => {
      const app = createApp(deps);

      const page = await request(app).get('/api/docs/');
      expect(page.status).toBe(200);
      expect(page.text).toContain('swagger-ui');
      expect(page.text).not.toMatch(/<script>(?!\s*<\/script>)/);

      const init = await request(app).get('/api/docs/swagger-ui-init.js');
      expect(init.status).toBe(200);
      expect(init.text).toContain(OPENAPI_SPEC_PATH);
      expect(init.text).toContain('"persistAuthorization": false');
      expect(init.text).toContain('"validatorUrl": null');
    }),
  );
});

describe('OpenAPI document', () => {
  const document = getOpenApiDocument('en');
  const documentedRoutes = Object.entries(document.paths).flatMap(([path, item]) =>
    Object.keys(item as object).map((method) => `${method} ${path}`),
  );

  it('should define bearer JWT as the only security scheme', () => {
    const schemes = document.components?.securitySchemes ?? {};
    expect(Object.keys(schemes)).toEqual([BEARER_SCHEME]);
    expect(schemes[BEARER_SCHEME]).toMatchObject({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });
  });

  it('should document every API route except cookie-authenticated ones', () => {
    const appRoutes = listApiRoutes(createApp(deps)).filter(
      (route) => !UNDOCUMENTED_ROUTES.has(route),
    );

    expect(documentedRoutes.sort()).toEqual(appRoutes.sort());
  });

  it('should discover routes on every mounted router, including nested ones and path params', () => {
    const nested = Router();
    nested.delete('/:statementId', jest.fn());
    const mailbox = Router();
    mailbox.get('/', jest.fn());
    mailbox.use('/statements', nested);

    const app = express();
    app.use(Router());
    app.use(`${API_PREFIX}/mailbox`, mailbox);
    app.get('/health', jest.fn());

    expect(listApiRoutes(app).sort()).toEqual([
      'delete /api/v1/mailbox/statements/{statementId}',
      'get /api/v1/mailbox',
    ]);
  });

  it('should fail loudly on a mount path it cannot read', () => {
    const app = express();
    app.use('/api/v1/:tenant', Router());

    expect(() => listApiRoutes(app)).toThrow('Cannot read router mount path');
  });

  it('should require the bearer token on every route except the public ones', () => {
    const publicRoutes = [
      'post /api/v1/auth/login',
      'post /api/v1/auth/register',
      // Identified by the refresh cookie so it works after the access token expires.
      'delete /api/v1/auth/logout',
      // Browser redirect from the mail provider; bound to the user by server-side state + cookie.
      'get /api/v1/mailboxes/oauth/callback/{provider}',
    ];

    for (const [path, item] of Object.entries(document.paths)) {
      for (const [method, operation] of Object.entries(
        item as Record<string, { security?: unknown }>,
      )) {
        const expected = publicRoutes.includes(`${method} ${path}`)
          ? undefined
          : [{ [BEARER_SCHEME]: [] }];
        expect({ route: `${method} ${path}`, security: operation.security }).toEqual({
          route: `${method} ${path}`,
          security: expected,
        });
      }
    }
  });

  it('should reuse the route validation rules for request bodies', () => {
    const panBody = document.paths['/api/v1/pan/register']?.post?.requestBody as {
      content: Record<string, { schema: { properties: Record<string, { pattern?: string }> } }>;
    };
    expect(panBody.content['application/json']?.schema.properties['pan']?.pattern).toBe(
      '^[A-Z]{5}[0-9]{4}[A-Z]$',
    );
  });

  it('should reuse the mailbox route schemas for bodies and path params', () => {
    const resolveBody = document.paths['/api/v1/mailboxes/resolve']?.post?.requestBody as {
      content: Record<string, { schema: { properties: Record<string, { maxLength?: number }> } }>;
    };
    expect(resolveBody.content['application/json']?.schema.properties['email']?.maxLength).toBe(
      254,
    );

    const syncParams = document.paths['/api/v1/mailboxes/{mailboxId}/sync']?.post?.parameters as
      | Array<{ name: string; in: string; schema: { format?: string } }>
      | undefined;
    expect(syncParams).toEqual([
      expect.objectContaining({
        name: 'mailboxId',
        in: 'path',
        schema: expect.objectContaining({ format: 'uuid' }),
      }),
    ]);
  });

  it('should cache the document per language', () => {
    expect(getOpenApiDocument('en')).toBe(document);
  });
});
