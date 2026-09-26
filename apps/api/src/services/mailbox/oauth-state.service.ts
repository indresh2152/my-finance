import type { Queryable } from '../audit-log.writer';
import { decrypt, encrypt, type KeyRing } from '../../utils/crypto.utils';
import { createPkcePair, randomToken, sha256Hex } from '../../utils/pkce.utils';
import type { ProviderKey } from './providers/mail-provider';

const STATE_TTL_MS = 10 * 60 * 1000;

export interface PendingOAuth {
  userId: string;
  provider: ProviderKey;
  loginHint: string;
  codeVerifier: string;
}

interface OAuthStateRow {
  user_id: string;
  provider: ProviderKey;
  login_hint_enc: Buffer;
  code_verifier_enc: Buffer;
  expires_at: Date;
}

/**
 * Stores a single-use, short-lived OAuth `state` (with its PKCE verifier and login hint,
 * both encrypted at rest) so the callback route can verify and consume it exactly once.
 */
export class OAuthStateService {
  constructor(
    private readonly db: Queryable,
    private readonly keyRing: KeyRing,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(input: {
    userId: string;
    provider: ProviderKey;
    loginHint: string;
  }): Promise<{ state: string; codeChallenge: string }> {
    const state = randomToken();
    const { verifier, challenge } = createPkcePair();
    await this.db.query(
      `INSERT INTO oauth_states (state_hash, user_id, provider, login_hint_enc, code_verifier_enc, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        sha256Hex(state),
        input.userId,
        input.provider,
        encrypt(input.loginHint, this.keyRing),
        encrypt(verifier, this.keyRing),
        new Date(this.now().getTime() + STATE_TTL_MS),
      ],
    );
    return { state, codeChallenge: challenge };
  }

  /** Single use: the row is deleted whether or not it has expired. */
  async consume(state: string): Promise<PendingOAuth | null> {
    const { rows } = await this.db.query<OAuthStateRow>(
      `DELETE FROM oauth_states WHERE state_hash = $1
       RETURNING user_id, provider, login_hint_enc, code_verifier_enc, expires_at`,
      [sha256Hex(state)],
    );
    const row = rows[0];
    if (!row || row.expires_at.getTime() <= this.now().getTime()) {
      return null;
    }
    return {
      userId: row.user_id,
      provider: row.provider,
      loginHint: decrypt(row.login_hint_enc, this.keyRing),
      codeVerifier: decrypt(row.code_verifier_enc, this.keyRing),
    };
  }
}
