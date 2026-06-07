import bcrypt from 'bcryptjs';
import type { Pool } from 'pg';
import { signAccessToken, signRefreshToken, verifyRefreshToken, hashToken } from '../utils/token.utils';
import type { AccessTokenPayload } from '../utils/token.utils';
import { AppError } from '../middleware/error.middleware';
import { i18next } from '../i18n';

const BCRYPT_ROUNDS = 12;
const REFRESH_TOKEN_TTL_DAYS = 7;

interface UserRow {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  pan_masked: string | null;
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  hasPan: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  constructor(
    private readonly db: Pool,
    private readonly jwtSecret: string,
    private readonly refreshTokenSecret: string,
  ) {}

  async register(
    username: string,
    email: string,
    password: string,
    lng: string,
  ): Promise<{ tokens: AuthTokens; user: AuthUser }> {
    const usernameExists = await this.db.query('SELECT id FROM users WHERE username = $1', [username]);
    if (usernameExists.rows.length > 0) {
      throw new AppError('USERNAME_TAKEN', 409, i18next.t('error.username_taken', { lng }));
    }

    const emailExists = await this.db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (emailExists.rows.length > 0) {
      throw new AppError('EMAIL_TAKEN', 409, i18next.t('error.email_taken', { lng }));
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const { rows } = await this.db.query<{ id: string; username: string; email: string }>(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, username, email`,
      [username, email, passwordHash],
    );

    const newUser = rows[0]!;
    const user: AuthUser = { id: newUser.id, username: newUser.username, email: newUser.email, hasPan: false };
    const tokens = await this.issueTokens(newUser.id, user, lng);

    return { tokens, user };
  }

  async login(
    username: string,
    password: string,
    lng: string,
    userAgent?: string,
    ip?: string,
  ): Promise<{ tokens: AuthTokens; user: AuthUser }> {
    const { rows } = await this.db.query<UserRow>(
      `SELECT u.id, u.username, u.email, u.password_hash, p.pan_masked
       FROM users u
       LEFT JOIN pan_profiles p ON p.user_id = u.id
       WHERE u.username = $1 AND u.deleted_at IS NULL`,
      [username],
    );

    if (rows.length === 0) {
      throw new AppError('INVALID_CREDENTIALS', 401, i18next.t('error.invalid_credentials', { lng }));
    }

    const row = rows[0]!;
    const passwordMatch = await bcrypt.compare(password, row.password_hash);

    if (!passwordMatch) {
      throw new AppError('INVALID_CREDENTIALS', 401, i18next.t('error.invalid_credentials', { lng }));
    }

    const user: AuthUser = {
      id: row.id,
      username: row.username,
      email: row.email,
      hasPan: row.pan_masked !== null,
    };

    const tokens = await this.issueTokens(row.id, user, lng, userAgent, ip);
    return { tokens, user };
  }

  async refresh(
    rawRefreshToken: string,
    lng: string,
  ): Promise<AuthTokens> {
    let userId: string;

    try {
      ({ userId } = verifyRefreshToken(rawRefreshToken, this.refreshTokenSecret));
    } catch {
      throw new AppError('REFRESH_TOKEN_INVALID', 401, i18next.t('error.refresh_token_invalid', { lng }));
    }

    const tokenHash = hashToken(rawRefreshToken);
    const { rows } = await this.db.query<{ id: string; revoked_at: string | null }>(
      `SELECT id, revoked_at FROM refresh_tokens
       WHERE token_hash = $1 AND user_id = $2 AND expires_at > NOW()`,
      [tokenHash, userId],
    );

    if (rows.length === 0) {
      throw new AppError('REFRESH_TOKEN_INVALID', 401, i18next.t('error.refresh_token_invalid', { lng }));
    }

    if (rows[0]!.revoked_at !== null) {
      // Token reuse detected — revoke all sessions
      await this.db.query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
        [userId],
      );
      throw new AppError('REFRESH_TOKEN_INVALID', 401, i18next.t('error.refresh_token_invalid', { lng }));
    }

    // Revoke used token
    await this.db.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1', [tokenHash]);

    // Fetch current user for new token payload
    const userRes = await this.db.query<{ id: string; username: string; email: string; pan_masked: string | null }>(
      `SELECT u.id, u.username, u.email, p.pan_masked
       FROM users u
       LEFT JOIN pan_profiles p ON p.user_id = u.id
       WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [userId],
    );

    if (userRes.rows.length === 0) {
      throw new AppError('REFRESH_TOKEN_INVALID', 401, i18next.t('error.refresh_token_invalid', { lng }));
    }

    const user = userRes.rows[0]!;
    return this.issueTokens(user.id, {
      id: user.id,
      username: user.username,
      email: user.email,
      hasPan: user.pan_masked !== null,
    }, lng);
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = hashToken(rawRefreshToken);
    await this.db.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1',
      [tokenHash],
    );
  }

  private async issueTokens(
    userId: string,
    payload: AuthUser,
    _lng: string,
    userAgent?: string,
    ip?: string,
  ): Promise<AuthTokens> {
    const jwtPayload: AccessTokenPayload = {
      userId: payload.id,
      username: payload.username,
      email: payload.email,
      hasPan: payload.hasPan,
    };

    const accessToken = signAccessToken(jwtPayload, this.jwtSecret);
    const refreshToken = signRefreshToken(userId, this.refreshTokenSecret);
    const tokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    await this.db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5::inet)`,
      [userId, tokenHash, expiresAt, userAgent ?? null, ip ?? null],
    );

    return { accessToken, refreshToken };
  }
}
