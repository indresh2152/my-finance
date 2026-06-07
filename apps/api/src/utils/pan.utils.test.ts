import { validatePan, hashPan, maskPan } from './pan.utils';

describe('validatePan', () => {
  it('should return true for a valid PAN', () => {
    expect(validatePan('ABCDE1234F')).toBe(true);
  });

  it('should return false for lowercase letters', () => {
    expect(validatePan('abcde1234f')).toBe(false);
  });

  it('should return false for PAN shorter than 10 characters', () => {
    expect(validatePan('ABCDE123')).toBe(false);
  });

  it('should return false for PAN longer than 10 characters', () => {
    expect(validatePan('ABCDE1234FX')).toBe(false);
  });

  it('should return false when digits are in wrong positions', () => {
    expect(validatePan('1234EABCDF')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(validatePan('')).toBe(false);
  });

  it('should return false when last character is a digit', () => {
    expect(validatePan('ABCDE12341')).toBe(false);
  });
});

describe('hashPan', () => {
  const SECRET = 'test-secret';

  it('should return a 64-character hex string', () => {
    const result = hashPan('ABCDE1234F', SECRET);
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  it('should be deterministic for same input and secret', () => {
    expect(hashPan('ABCDE1234F', SECRET)).toBe(hashPan('ABCDE1234F', SECRET));
  });

  it('should differ for different PANs', () => {
    expect(hashPan('ABCDE1234F', SECRET)).not.toBe(hashPan('XYZAB9876G', SECRET));
  });

  it('should differ for different secrets', () => {
    expect(hashPan('ABCDE1234F', 'secret-a')).not.toBe(hashPan('ABCDE1234F', 'secret-b'));
  });
});

describe('maskPan', () => {
  it('should replace the 4 numeric digits with #', () => {
    expect(maskPan('ABCDE1234F')).toBe('ABCDE####F');
  });

  it('should preserve the first 5 letters', () => {
    expect(maskPan('XYZAB9876G').slice(0, 5)).toBe('XYZAB');
  });

  it('should preserve the last letter', () => {
    expect(maskPan('ABCDE1234F').slice(-1)).toBe('F');
  });

  it('should produce a 10-character string', () => {
    expect(maskPan('ABCDE1234F')).toHaveLength(10);
  });
});
