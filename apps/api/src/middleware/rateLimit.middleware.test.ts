import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { makeUserRateLimiter } from './rateLimit.middleware';

const buildApp = (userId: string | null): express.Express => {
  const app = express();
  app.set('trust proxy', false);
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (userId) req.user = { id: userId, username: 'u', email: 'e@e.com', hasPan: true };
    next();
  });
  app.get('/limited', makeUserRateLimiter(60_000, 2), (_req, res) => {
    res.json({ ok: true });
  });
  return app;
};

describe('makeUserRateLimiter', () => {
  it('should allow requests up to the limit and then return 429', async () => {
    const app = buildApp('user-a');
    await request(app).get('/limited').expect(200);
    await request(app).get('/limited').expect(200);
    const res = await request(app).get('/limited');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('should count each user separately', async () => {
    const limiter = makeUserRateLimiter(60_000, 1);
    const app = express();
    let current = 'user-1';
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.user = { id: current, username: 'u', email: 'e@e.com', hasPan: true };
      next();
    });
    app.get('/limited', limiter, (_req, res) => {
      res.json({ ok: true });
    });
    await request(app).get('/limited').expect(200);
    current = 'user-2';
    await request(app).get('/limited').expect(200);
  });

  it('should fall back to the IP when there is no user', async () => {
    const app = buildApp(null);
    await request(app).get('/limited').expect(200);
  });
});
