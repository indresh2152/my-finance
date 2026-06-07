import { Router, type Request, type Response, type NextFunction } from 'express';
import type { AppDeps } from '../app';
import { CreditCardsService } from '../services/credit-cards.service';
import { requireAuth } from '../middleware/auth.middleware';

export const creditCardsRouter = (deps: AppDeps): Router => {
  const router = Router();
  const service = new CreditCardsService(deps.db);

  router.get(
    '/',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const cards = await service.listByUserId(req.user!.id, req.language);
        res.json({ cards });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
};
