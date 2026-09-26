import { Router, type Request, type Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { getOpenApiDocument } from './openapi';

export const API_DOCS_PATH = '/api/docs';
export const OPENAPI_SPEC_PATH = `${API_DOCS_PATH}/openapi.json`;

/**
 * Interactive API reference (Swagger UI). Callers authenticate with a bearer
 * access token obtained from POST /api/v1/auth/login. The token lives only in
 * page memory: `persistAuthorization` stays off so it never reaches localStorage.
 */
export const apiDocsRouter = (): Router => {
  const router = Router();
  const uiOptions = {
    swaggerOptions: {
      url: OPENAPI_SPEC_PATH,
      persistAuthorization: false,
      validatorUrl: null,
    },
  };

  router.get('/openapi.json', (req: Request, res: Response): void => {
    res.json(getOpenApiDocument(req.language));
  });

  router.use('/', swaggerUi.serveFiles(undefined, uiOptions), swaggerUi.setup(undefined, uiOptions));

  return router;
};
