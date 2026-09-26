import crypto from 'crypto';

const DEFAULT_TOKEN_BYTES = 32;

export const randomToken = (bytes: number = DEFAULT_TOKEN_BYTES): string =>
  crypto.randomBytes(bytes).toString('base64url');

export const createPkcePair = (): { verifier: string; challenge: string } => {
  const verifier = randomToken();
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
};

export const sha256Hex = (value: string): string =>
  crypto.createHash('sha256').update(value).digest('hex');
