const INR_FORMATTER = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
const DATE_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const INR_COMPACT_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const MONTH_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

export const formatInr = (amount: number): string => INR_FORMATTER.format(amount);

/** Short amounts for chart axes, in lakhs and crores: '₹1.5L', '₹2Cr'. */
export const formatInrCompact = (amount: number): string => INR_COMPACT_FORMATTER.format(amount);

/** For a month ('2026-09') or a date in it: 'Sep 2026'. */
export const formatMonth = (isoDateOrMonth: string): string =>
  MONTH_FORMATTER.format(new Date(`${isoDateOrMonth.slice(0, 7)}-01T00:00:00Z`));

/** For date-only values ('2026-09-25'): read and printed in UTC, so no timezone can shift the day. */
export const formatDate = (isoDate: string): string =>
  DATE_FORMATTER.format(new Date(`${isoDate}T00:00:00Z`));

/** '•••• 1234': only the last 4 digits of a card number are ever shown. */
export const maskLast4 = (last4: string): string => `•••• ${last4}`;
