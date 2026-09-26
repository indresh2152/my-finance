import { firstRowOrThrow, isUniqueViolation } from './db.utils';

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
