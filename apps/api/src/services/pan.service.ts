import type { Pool } from 'pg';
import pino from 'pino';
import { validatePan, hashPan, maskPan } from '../utils/pan.utils';
import { AppError } from '../middleware/error.middleware';
import { i18next } from '../i18n';
import { firstRowOrThrow, isUniqueViolation } from '../utils/db.utils';
import type { PanVerifier } from './pan.verifier';

const logger = pino({ name: 'pan-service' });

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
    private readonly verifier: PanVerifier,
  ) {}

  async register(userId: string, rawPan: string, lng: string): Promise<PanProfile> {
    if (!validatePan(rawPan)) {
      throw new AppError('INVALID_PAN_FORMAT', 400, i18next.t('error.pan_invalid', { lng }));
    }

    const panHash = hashPan(rawPan, this.hmacSecret);

    // Checked before verification so a known conflict skips the billed Setu call.
    // Concurrent requests can still all pass this and each call Setu; the unique
    // indexes then reject all but one INSERT (handled below).
    const preCheckConflict = await this.findConflict(userId, panHash, lng);
    if (preCheckConflict) throw preCheckConflict;

    const verificationResult = await this.verifier.verify(rawPan, lng);
    if (!verificationResult.valid) {
      logger.info(
        {
          userId,
          status: verificationResult.status,
          verifierMessage: verificationResult.message,
          traceId: verificationResult.traceId,
        },
        'PAN verification did not succeed',
      );
      throw new AppError(
        'PAN_VERIFICATION_FAILED',
        422,
        i18next.t('error.pan_verification_failed', { lng }),
      );
    }

    const panMasked = maskPan(rawPan);

    let rows: PanProfileRow[];
    try {
      ({ rows } = await this.db.query<PanProfileRow>(
        `INSERT INTO pan_profiles (user_id, pan_hash, pan_masked, verified_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING id, pan_masked, verified_at, created_at`,
        [userId, panHash, panMasked],
      ));
    } catch (err) {
      // A concurrent request can pass the pre-check above and win the INSERT race;
      // re-run the check to report which uniqueness rule the winner now holds.
      const raceConflict = isUniqueViolation(err)
        ? await this.findConflict(userId, panHash, lng)
        : null;
      throw raceConflict ?? err;
    }

    const row = firstRowOrThrow(rows, 'insert pan_profiles');
    return { id: row.id, panMasked: row.pan_masked, verifiedAt: row.verified_at };
  }

  async getByUserId(userId: string, lng: string): Promise<PanProfile> {
    const { rows } = await this.db.query<PanProfileRow>(
      'SELECT id, pan_masked, verified_at, created_at FROM pan_profiles WHERE user_id = $1',
      [userId],
    );

    const row = rows[0];
    if (!row) {
      throw new AppError('PAN_NOT_REGISTERED', 404, i18next.t('error.pan_not_registered', { lng }));
    }

    return { id: row.id, panMasked: row.pan_masked, verifiedAt: row.verified_at };
  }

  /**
   * Returns the 409 to raise if this user already has a PAN or the PAN belongs to
   * another user, otherwise null. The user's own profile wins when both match.
   */
  private async findConflict(
    userId: string,
    panHash: string,
    lng: string,
  ): Promise<AppError | null> {
    const { rows } = await this.db.query<{ user_id: string }>(
      'SELECT user_id FROM pan_profiles WHERE user_id = $1 OR pan_hash = $2',
      [userId, panHash],
    );
    if (rows.some((row) => row.user_id === userId)) {
      return new AppError(
        'PAN_ALREADY_REGISTERED',
        409,
        i18next.t('error.pan_already_registered', { lng }),
      );
    }
    if (rows.length > 0) {
      return new AppError(
        'PAN_LINKED_TO_ANOTHER_ACCOUNT',
        409,
        i18next.t('error.pan_linked_to_another_account', { lng }),
      );
    }
    return null;
  }
}
