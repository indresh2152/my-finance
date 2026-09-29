import { types } from 'pg';
import './index';

describe('pg type parsers', () => {
  it('should keep DATE columns as YYYY-MM-DD strings, free of timezone shifts', () => {
    expect(types.getTypeParser(1082, 'text')('2026-09-05')).toBe('2026-09-05');
  });
});
