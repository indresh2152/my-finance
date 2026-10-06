import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { i18next } from '../i18n';
import { CreditCardsService } from '../services/credit-cards.service';
import { getAuthUser, requireAuth } from '../middleware/auth.middleware';

export const buildCardIdSchema = (lng: string): z.ZodObject<{ cardId: z.ZodString }> =>
  z.object({
    cardId: z.string().uuid(i18next.t('validation.card_id_invalid', { lng })),
  });

export const creditCardsRouter = (deps: AppDeps): Router => {
  const router = Router();
  const service = new CreditCardsService(deps.db);

  router.get(
    '/',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const cards = await service.listByUserId(getAuthUser(req).id, req.language);
        res.json({ cards });
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    '/:cardId/statements',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { cardId } = buildCardIdSchema(req.language).parse(req.params);
        res.json(await service.getStatementHistory(getAuthUser(req).id, cardId, req.language));
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
};
