import request from 'supertest';
import type { Router } from 'express';
import { createApp, type AppDeps } from '../app';
import { authRouter } from '../routes/auth.routes';
import { panRouter } from '../routes/pan.routes';
import { creditCardsRouter } from '../routes/credit-cards.routes';
import { usersRouter } from '../routes/users.routes';
import { getOpenApiDocument, BEARER_SCHEME } from './openapi';
import { OPENAPI_SPEC_PATH } from './api-docs.router';
import { withEnv } from '../test/with-env';

const deps: AppDeps = {
  db: { query: jest.fn() } as never,
  jwtSecret: 'test-jwt-secret-at-least-32-chars!!',
  refreshTokenSecret: 'test-refresh-secret-32-chars-min!!',
  panHmacSecret: 'test-pan-hmac-secret-32-chars-min!',
  panVerifier: { verify: jest.fn() } as never,
};

/** Cookie-authenticated routes are intentionally not exposed: the docs are bearer-only. */
const UNDOCUMENTED_ROUTES = new Set(['post /api/v1/auth/refresh']);

interface RouteLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

const listRoutes = (prefix: string, router: Router): string[] =>
  (router.stack as RouteLayer[]).flatMap((layer) => {
    if (!layer.route) return [];
    const fullPath = `${prefix}${layer.route.path}`.replace(/\/$/, '');
    return Object.keys(layer.route.methods).map((method) => `${method} ${fullPath}`);
  });

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
    const appRoutes = [
      ...listRoutes('/api/v1/auth', authRouter(deps)),
      ...listRoutes('/api/v1/pan', panRouter(deps)),
      ...listRoutes('/api/v1/credit-cards', creditCardsRouter(deps)),
      ...listRoutes('/api/v1/users', usersRouter(deps)),
    ].filter((route) => !UNDOCUMENTED_ROUTES.has(route));

    expect(documentedRoutes.sort()).toEqual(appRoutes.sort());
  });

  it('should require the bearer token on every route except login and register', () => {
    const publicRoutes = ['post /api/v1/auth/login', 'post /api/v1/auth/register'];

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

  it('should cache the document per language', () => {
    expect(getOpenApiDocument('en')).toBe(document);
  });
});
