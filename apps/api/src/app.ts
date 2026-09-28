import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import i18next from 'i18next';
import type { Pool } from 'pg';

import { localeMiddleware } from './middleware/locale.middleware';
import { authMiddleware } from './middleware/auth.middleware';
import { auditMiddleware } from './middleware/audit.middleware';
import { errorMiddleware, AppError } from './middleware/error.middleware';
import { authRouter } from './routes/auth.routes';
import { panRouter } from './routes/pan.routes';
import { creditCardsRouter } from './routes/credit-cards.routes';
import { usersRouter } from './routes/users.routes';
import { mailboxesRouter, type MailboxModule } from './routes/mailboxes.routes';
import { apiDocsRouter, API_DOCS_PATH } from './docs/api-docs.router';
import type { PanVerifier } from './services/pan.verifier';

export interface AppDeps {
  db: Pool;
  jwtSecret: string;
  refreshTokenSecret: string;
  panHmacSecret: string;
  panVerifier: PanVerifier;
  /** Present only when MAILBOX_ENABLED=true. */
  mailbox?: MailboxModule;
}

export const createApp = (deps: AppDeps): Express => {
  const app = express();

  app.use(helmet());

  if (process.env['NODE_ENV'] !== 'production') {
    app.use(
      cors({
        origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:5173',
        credentials: true,
      }),
    );
  }

  app.use(express.json());
  app.use(cookieParser());
  app.use(localeMiddleware);
  app.use(authMiddleware(deps.jwtSecret));
  app.use(auditMiddleware(deps.db));

  app.get('/health', (_req: Request, res: Response): void => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/ready', async (_req: Request, res: Response): Promise<void> => {
    try {
      await deps.db.query('SELECT 1');
      res.json({ status: 'ready', db: 'connected' });
    } catch {
      res.status(503).json({ status: 'not ready', db: 'unreachable' });
    }
  });

  app.use('/api/v1/auth', authRouter(deps));
  app.use('/api/v1/pan', panRouter(deps));
  app.use('/api/v1/credit-cards', creditCardsRouter(deps));
  app.use('/api/v1/users', usersRouter(deps));

  if (deps.mailbox) {
    app.use('/api/v1/mailboxes', mailboxesRouter(deps.mailbox));
  }

  if (process.env['API_DOCS_ENABLED'] === 'true') {
    app.use(API_DOCS_PATH, apiDocsRouter());
  }

  // Unmatched API paths must 404 rather than fall through to the SPA catch-all,
  // which would otherwise serve index.html (e.g. an iframe of disabled docs nesting the app).
  app.use('/api', (req: Request, _res: Response, next: NextFunction): void => {
    next(
      new AppError('NOT_FOUND', 404, i18next.t('error.not_found', { lng: req.language ?? 'en' })),
    );
  });

  if (process.env['NODE_ENV'] === 'production') {
    const publicDir = path.join(__dirname, '..', 'public');
    app.use(express.static(publicDir));
    app.get('*', (_req: Request, res: Response): void => {
      res.sendFile(path.join(publicDir, 'index.html'));
    });
  }

  app.use(errorMiddleware);

  return app;
};
