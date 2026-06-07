import express, { type Express, type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import type { Pool } from 'pg';

import { localeMiddleware } from './middleware/locale.middleware';
import { authMiddleware } from './middleware/auth.middleware';
import { auditMiddleware } from './middleware/audit.middleware';
import { errorMiddleware } from './middleware/error.middleware';
import { authRouter } from './routes/auth.routes';
import { panRouter } from './routes/pan.routes';
import { creditCardsRouter } from './routes/credit-cards.routes';
import { usersRouter } from './routes/users.routes';

export interface AppDeps {
  db: Pool;
  jwtSecret: string;
  refreshTokenSecret: string;
  panHmacSecret: string;
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
