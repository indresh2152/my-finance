import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import type { AppDeps } from '../app';
import type { Request, Response, NextFunction } from 'express';

export const usersRouter = (deps: AppDeps): Router => {
  const router = Router();

  router.get(
    '/me',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = req.user!.id;

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

        if (rows.length === 0) {
          res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
          return;
        }

        const row = rows[0]!;
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
