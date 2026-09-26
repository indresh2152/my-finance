import { AppError } from '../middleware/error.middleware';
import { i18next } from '../i18n';
import type { Queryable } from './audit-log.writer';

const FORBIDDEN = 403;

export const requirePanProfileId = async (
  db: Queryable,
  userId: string,
  lng: string,
): Promise<string> => {
  const { rows } = await db.query<{ id: string }>(
    'SELECT id FROM pan_profiles WHERE user_id = $1',
    [userId],
  );
  const row = rows[0];
  if (!row) {
    throw new AppError(
      'PAN_NOT_REGISTERED',
      FORBIDDEN,
      i18next.t('error.pan_not_registered', { lng }),
    );
  }
  return row.id;
};
