import { Router } from 'express';
import { getAuthUser, requireAuth } from '../middleware/auth.middleware';
import type { AppDeps } from '../app';
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/error.middleware';
import { i18next } from '../i18n';

export const usersRouter = (deps: AppDeps): Router => {
  const router = Router();

  router.get(
    '/me',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = getAuthUser(req).id;

        const { rows } = await deps.db.query<{
          id: string;
          username: string;
          email: string;
          pan_masked: string | null;
        }>(
          `SELECT u.id, u.username, u.email, p.pan_masked
           FROM users u
           LEFT JOIN pan_profiles p ON p.user_id = u.id
           WHERE u.id = $1 AND u.deleted_at IS NULL`,
          [userId],
        );

        const row = rows[0];
        if (!row) {
          throw new AppError(
            'USER_NOT_FOUND',
            404,
            i18next.t('error.user_not_found', { lng: req.language }),
          );
        }

        res.json({
          id: row.id,
          username: row.username,
          email: row.email,
          hasPan: row.pan_masked !== null,
          panMasked: row.pan_masked,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
};
