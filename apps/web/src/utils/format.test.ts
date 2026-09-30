import { formatDate, formatInr, formatIstDate, maskLast4 } from './format';

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

describe('formatIstDate', () => {
  it('should show an instant as its calendar day in India', () => {
    // 20:00 UTC on 24 Sep is 01:30 on 25 Sep in IST.
    expect(formatIstDate('2026-09-24T20:00:00Z')).toMatch(/^25 Sept? 2026$/);
    expect(formatIstDate('2026-01-01T00:00:00.000Z')).toBe('01 Jan 2026');
  });
});

describe('maskLast4', () => {
  it('should hide all but the last 4 digits', () => {
    expect(maskLast4('1234')).toBe('•••• 1234');
  });
});
