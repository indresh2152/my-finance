import { formatDate, formatInr, formatInrCompact, formatMonth, maskLast4 } from './format';

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

describe('maskLast4', () => {
  it('should hide all but the last 4 digits', () => {
    expect(maskLast4('1234')).toBe('•••• 1234');
  });
});

describe('formatInrCompact', () => {
  it('should shorten amounts into thousands, lakhs and crores', () => {
    expect(formatInrCompact(500)).toBe('₹500');
    expect(formatInrCompact(150000)).toBe('₹1.5L');
    expect(formatInrCompact(25000000)).toBe('₹2.5Cr');
  });
});

describe('formatMonth', () => {
  it('should show a month or a date in it as short month and year', () => {
    expect(formatMonth('2026-01')).toBe('Jan 2026');
    expect(formatMonth('2026-09-30')).toMatch(/^Sept? 2026$/);
  });
});
