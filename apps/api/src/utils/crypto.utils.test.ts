import { parseKeyRing, encrypt, decrypt } from './crypto.utils';

const KEY_1 = '11'.repeat(32);
const KEY_2 = '22'.repeat(32);

describe('parseKeyRing', () => {
  it('should parse versioned keys and the active version', () => {
    const ring = parseKeyRing(`1:${KEY_1}, 2:${KEY_2}`, 2);
    expect(ring.activeVersion).toBe(2);
    expect(ring.keys.size).toBe(2);
  });

  it('should reject a key that is not 32 bytes', () => {
    expect(() => parseKeyRing('1:abcd', 1)).toThrow('Key 1 must be 32 bytes of hex');
  });

  it('should reject an invalid version number', () => {
    expect(() => parseKeyRing(`x:${KEY_1}`, 1)).toThrow('Invalid key version: x');
  });

  it('should reject an active version that has no key', () => {
    expect(() => parseKeyRing(`1:${KEY_1}`, 2)).toThrow('Active key version 2 not found');
  });
});

describe('encrypt / decrypt', () => {
  const ring = parseKeyRing(`1:${KEY_1}`, 1);

  it('should round-trip a value', () => {
    expect(decrypt(encrypt('refresh-token-value', ring), ring)).toBe('refresh-token-value');
  });

  it('should produce different ciphertexts for the same input', () => {
    expect(encrypt('same', ring).equals(encrypt('same', ring))).toBe(false);
  });

  it('should prefix the payload with the active key version', () => {
    expect(encrypt('x', ring)[0]).toBe(1);
  });

  it('should detect tampering', () => {
    const payload = encrypt('secret', ring);
    const lastIndex = payload.length - 1;
    const lastByte = payload.at(lastIndex);
    expect(lastByte).toBeDefined();
    payload[lastIndex] = (lastByte ?? 0) ^ 0xff;
    expect(() => decrypt(payload, ring)).toThrow();
  });

  it('should decrypt a value written with an older key after rotation', () => {
    const oldPayload = encrypt('old', ring);
    const rotated = parseKeyRing(`1:${KEY_1},2:${KEY_2}`, 2);
    expect(decrypt(oldPayload, rotated)).toBe('old');
    expect(encrypt('new', rotated)[0]).toBe(2);
  });

  it('should reject a payload whose key version is unknown', () => {
    const rotated = parseKeyRing(`2:${KEY_2}`, 2);
    expect(() => decrypt(encrypt('x', ring), rotated)).toThrow('Unknown key version 1');
  });

  it('should reject a truncated payload', () => {
    expect(() => decrypt(Buffer.from([1, 2, 3]), ring)).toThrow('Encrypted payload too short');
  });
});
