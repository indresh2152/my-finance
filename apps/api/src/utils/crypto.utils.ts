import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const VERSION_LENGTH = 1;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const MIN_VERSION = 1;
const MAX_VERSION = 255;
const HEADER_LENGTH = VERSION_LENGTH + IV_LENGTH + TAG_LENGTH;

export interface KeyRing {
  activeVersion: number;
  keys: ReadonlyMap<number, Buffer>;
}

/** Parses "1:<hex>,2:<hex>" into a key ring. Payload layout: version(1) | iv(12) | tag(16) | ciphertext. */
export const parseKeyRing = (keysSpec: string, activeVersion: number): KeyRing => {
  const keys = new Map<number, Buffer>();

  for (const entry of keysSpec
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)) {
    const [versionText = '', hex = ''] = entry.split(':');
    const version = Number(versionText);
    if (!Number.isInteger(version) || version < MIN_VERSION || version > MAX_VERSION) {
      throw new Error(`Invalid key version: ${versionText}`);
    }
    const key = Buffer.from(hex, 'hex');
    if (key.length !== KEY_LENGTH) {
      throw new Error(`Key ${version} must be 32 bytes of hex`);
    }
    keys.set(version, key);
  }

  if (!keys.has(activeVersion)) {
    throw new Error(`Active key version ${activeVersion} not found`);
  }

  return { activeVersion, keys };
};

const getActiveKey = (ring: KeyRing): Buffer => {
  const key = ring.keys.get(ring.activeVersion);
  if (!key) {
    throw new Error(`Active key version ${ring.activeVersion} not found`);
  }
  return key;
};

export const encrypt = (plaintext: string, ring: KeyRing): Buffer => {
  const key = getActiveKey(ring);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from([ring.activeVersion]), iv, cipher.getAuthTag(), ciphertext]);
};

export const decrypt = (payload: Buffer, ring: KeyRing): string => {
  if (payload.length < HEADER_LENGTH) {
    throw new Error('Encrypted payload too short');
  }
  const version = payload.at(0) ?? 0;
  const key = ring.keys.get(version);
  if (!key) {
    throw new Error(`Unknown key version ${version}`);
  }
  const iv = payload.subarray(VERSION_LENGTH, VERSION_LENGTH + IV_LENGTH);
  const tag = payload.subarray(VERSION_LENGTH + IV_LENGTH, HEADER_LENGTH);
  const ciphertext = payload.subarray(HEADER_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
};
