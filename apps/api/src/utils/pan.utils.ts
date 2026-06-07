import crypto from 'crypto';

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export const validatePan = (pan: string): boolean => PAN_REGEX.test(pan);

export const hashPan = (pan: string, secret: string): string =>
  crypto.createHmac('sha256', secret).update(pan).digest('hex');

// Replace the 4 numeric digits (positions 5–8) with '#'
export const maskPan = (pan: string): string => pan.slice(0, 5) + '####' + pan.slice(9);
