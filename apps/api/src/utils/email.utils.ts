import crypto from 'crypto';

const VISIBLE_LOCAL_CHARS = 2;
const MASK = '****';
const DOMAIN_ALIASES: Readonly<Record<string, string>> = { 'googlemail.com': 'gmail.com' };

export const normaliseEmail = (email: string): string => email.trim().toLowerCase();

/** Normalised form used to compare the typed email with the account the provider returns. */
export const canonicaliseEmail = (email: string): string => {
  const normalised = normaliseEmail(email);
  const atIndex = normalised.lastIndexOf('@');
  if (atIndex === -1) return normalised;
  const domain = normalised.slice(atIndex + 1);
  return `${normalised.slice(0, atIndex)}@${DOMAIN_ALIASES[domain] ?? domain}`;
};

export const emailDomain = (email: string): string => {
  const normalised = normaliseEmail(email);
  const atIndex = normalised.lastIndexOf('@');
  return atIndex === -1 ? '' : normalised.slice(atIndex + 1);
};

export const hashEmail = (email: string, secret: string): string =>
  crypto.createHmac('sha256', secret).update(normaliseEmail(email)).digest('hex');

/** 'indresh@gmail.com' → 'in****@gmail.com' (fixed-length mask hides the local-part length). */
export const maskEmail = (email: string): string => {
  const normalised = normaliseEmail(email);
  const atIndex = normalised.lastIndexOf('@');
  if (atIndex === -1) return MASK;
  const local = normalised.slice(0, atIndex);
  return `${local.slice(0, VISIBLE_LOCAL_CHARS)}${MASK}@${normalised.slice(atIndex + 1)}`;
};
