import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export interface AccessTokenPayload {
  userId: string;
  username: string;
  email: string;
  hasPan: boolean;
}

export const signAccessToken = (payload: AccessTokenPayload, secret: string): string =>
  jwt.sign(payload, secret, { expiresIn: '15m' });

export const signRefreshToken = (userId: string, secret: string): string =>
  jwt.sign({ userId }, secret, { expiresIn: '7d' });

export const verifyAccessToken = (token: string, secret: string): AccessTokenPayload =>
  jwt.verify(token, secret) as AccessTokenPayload;

export const verifyRefreshToken = (token: string, secret: string): { userId: string } =>
  jwt.verify(token, secret) as { userId: string };

export const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');
