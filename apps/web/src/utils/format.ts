const INR_FORMATTER = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
const DATE_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
/** Instants are shown as the calendar day in India, whatever the viewer's own timezone. */
const IST_DATE_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
});

export const formatInr = (amount: number): string => INR_FORMATTER.format(amount);

/** For date-only values ('2026-09-25'): read and printed in UTC, so no timezone can shift the day. */
export const formatDate = (isoDate: string): string =>
  DATE_FORMATTER.format(new Date(`${isoDate}T00:00:00Z`));

/** For instants ('2026-09-24T20:00:00Z'): the day it was in India Standard Time. */
export const formatIstDate = (isoInstant: string): string =>
  IST_DATE_FORMATTER.format(new Date(isoInstant));

/** '•••• 1234': only the last 4 digits of a card or account number are ever shown. */
export const maskLast4 = (last4: string): string => `•••• ${last4}`;
