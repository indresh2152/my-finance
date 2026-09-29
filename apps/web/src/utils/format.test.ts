import { formatDate, formatInr } from './format';

describe('formatInr', () => {
  it('should use Indian digit grouping and the rupee sign', () => {
    expect(formatInr(1234567.5)).toBe('₹12,34,567.50');
  });
});

describe('formatDate', () => {
  it('should show a date-only value as day, short month and year without shifting the day', () => {
    // ICU renders September as "Sep" or "Sept" depending on its version.
    expect(formatDate('2026-09-25')).toMatch(/^25 Sept? 2026$/);
    expect(formatDate('2026-01-01')).toBe('01 Jan 2026');
  });
});
