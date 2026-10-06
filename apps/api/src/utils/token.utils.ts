import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { DAY_MS } from './time.utils';

/** Lifetime of a refresh token: the JWT, its refresh_tokens row, and its cookie. */
export const REFRESH_TOKEN_TTL_MS = 7 * DAY_MS;

export interface AccessTokenPayload {
  userId: string;
  username: string;
  email: string;
  hasPan: boolean;
}

export const signAccessToken = (payload: AccessTokenPayload, secret: string): string =>
  jwt.sign(payload, secret, { expiresIn: '15m' });

export const signRefreshToken = (userId: string, secret: string): string =>
  jwt.sign({ userId }, secret, {
    expiresIn: REFRESH_TOKEN_TTL_MS / 1000,
    jwtid: crypto.randomUUID(),
  });

export const verifyAccessToken = (token: string, secret: string): AccessTokenPayload =>
  jwt.verify(token, secret) as AccessTokenPayload;

export const verifyRefreshToken = (token: string, secret: string): { userId: string } =>
  jwt.verify(token, secret) as { userId: string };

export const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');
