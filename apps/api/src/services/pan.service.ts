import type { Pool } from 'pg';
import { validatePan, hashPan, maskPan } from '../utils/pan.utils';
import { AppError } from '../middleware/error.middleware';
import { i18next } from '../i18n';

interface PanProfileRow {
  id: string;
  pan_masked: string;
  verified_at: string | null;
  created_at: string;
}

export interface PanProfile {
  id: string;
  panMasked: string;
  verifiedAt: string | null;
}

export class PanService {
  constructor(
    private readonly db: Pool,
    private readonly hmacSecret: string,
  ) {}

  async register(userId: string, rawPan: string, lng: string): Promise<PanProfile> {
    if (!validatePan(rawPan)) {
      throw new AppError('INVALID_PAN_FORMAT', 400, i18next.t('error.pan_invalid', { lng }));
    }

    const existing = await this.db.query(
      'SELECT id FROM pan_profiles WHERE user_id = $1',
      [userId],
    );

    if (existing.rows.length > 0) {
      throw new AppError('PAN_ALREADY_REGISTERED', 409, i18next.t('error.pan_already_registered', { lng }));
    }

    const panHash = hashPan(rawPan, this.hmacSecret);
    const panMasked = maskPan(rawPan);

    const { rows } = await this.db.query<PanProfileRow>(
      `INSERT INTO pan_profiles (user_id, pan_hash, pan_masked)
       VALUES ($1, $2, $3)
       RETURNING id, pan_masked, verified_at, created_at`,
      [userId, panHash, panMasked],
    );

    const row = rows[0]!;
    return { id: row.id, panMasked: row.pan_masked, verifiedAt: row.verified_at };
  }

  async getByUserId(userId: string, lng: string): Promise<PanProfile> {
    const { rows } = await this.db.query<PanProfileRow>(
      'SELECT id, pan_masked, verified_at, created_at FROM pan_profiles WHERE user_id = $1',
      [userId],
    );

    if (rows.length === 0) {
      throw new AppError('PAN_NOT_REGISTERED', 404, i18next.t('error.pan_not_registered', { lng }));
    }

    const row = rows[0]!;
    return { id: row.id, panMasked: row.pan_masked, verifiedAt: row.verified_at };
  }
}
