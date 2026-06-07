import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { PanService } from '../services/pan.service';
import { requireAuth } from '../middleware/auth.middleware';
import { panRateLimiter } from '../middleware/rateLimit.middleware';
import { i18next } from '../i18n';

const buildPanSchema = (lng: string): z.ZodObject<{ pan: z.ZodString }> =>
  z.object({
    pan: z
      .string({ required_error: i18next.t('validation.pan_required', { lng }) })
      .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, i18next.t('validation.pan_format', { lng })),
  });

export const panRouter = (deps: AppDeps): Router => {
  const router = Router();
  const service = new PanService(deps.db, deps.panHmacSecret);

  router.post(
    '/register',
    requireAuth,
    panRateLimiter,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const body = buildPanSchema(req.language).parse(req.body);
        const profile = await service.register(req.user!.id, body.pan, req.language);
        res.status(201).json(profile);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    '/',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const profile = await service.getByUserId(req.user!.id, req.language);
        res.json(profile);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
};
