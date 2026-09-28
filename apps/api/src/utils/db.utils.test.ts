import { firstRowOrThrow, isBadDataError, isUniqueViolation, pgErrorCode } from './db.utils';

describe('firstRowOrThrow', () => {
  it('should return the first row when rows exist', () => {
    expect(firstRowOrThrow([{ id: 'a' }, { id: 'b' }], 'ctx')).toEqual({ id: 'a' });
  });

  it('should throw with the context when rows are empty', () => {
    expect(() => firstRowOrThrow([], 'insert pan_profiles')).toThrow(
      'insert pan_profiles: expected a row but the query returned none',
    );
  });
});

describe('isUniqueViolation', () => {
  it('should return true for a 23505 error', () => {
    expect(isUniqueViolation({ code: '23505', constraint: 'any_key' })).toBe(true);
  });

  it('should return false for other error codes and non-objects', () => {
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation('23505')).toBe(false);
  });
});

describe('pgErrorCode', () => {
  it('should return a SQLSTATE code', () => {
    expect(pgErrorCode({ code: '22P02' })).toBe('22P02');
  });

  it('should return null for non-SQLSTATE codes and values without a code', () => {
    expect(pgErrorCode({ code: 'ECONNRESET' })).toBeNull();
    expect(pgErrorCode({ code: 23505 })).toBeNull();
    expect(pgErrorCode(new Error('boom'))).toBeNull();
    expect(pgErrorCode(null)).toBeNull();
    expect(pgErrorCode('23505')).toBeNull();
  });
});

describe('isBadDataError', () => {
  it.each(['22001', '22P02', '23502', '23505', '23514'])('should be true for %s', (code) => {
    expect(isBadDataError({ code })).toBe(true);
  });

  it.each(['23503', '40001', '57P01', '08006'])('should be false for %s', (code) => {
    expect(isBadDataError({ code })).toBe(false);
  });

  it('should be false for errors without a SQLSTATE', () => {
    expect(isBadDataError(new Error('boom'))).toBe(false);
  });
});
