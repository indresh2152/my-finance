import type { CardStatement } from '../../services/credit-cards.api';

/** The card page covers the current month and the 11 before it, matching the API's window. */
export const HISTORY_MONTHS = 12;

export interface MonthlyAmount {
  /** 'YYYY-MM'. */
  readonly month: string;
  /** The amount due on the month's statement; null when no statement was issued that month. */
  readonly amount: number | null;
}

const monthOf = (year: number, monthIndex: number): string =>
  new Date(Date.UTC(year, monthIndex, 1)).toISOString().slice(0, 7);

/**
 * One entry per month, oldest first, ending with the month of `today` (in UTC, like the dates).
 * A month with two statements takes the later one.
 */
export const monthlyAmounts = (
  statements: readonly CardStatement[],
  today: Date,
): MonthlyAmount[] => {
  const latestByMonth = new Map<string, CardStatement>();
  for (const statement of statements) {
    const month = statement.statementDate.slice(0, 7);
    const current = latestByMonth.get(month);
    if (!current || statement.statementDate > current.statementDate) {
      latestByMonth.set(month, statement);
    }
  }

  return Array.from({ length: HISTORY_MONTHS }, (_, i) => {
    const month = monthOf(today.getUTCFullYear(), today.getUTCMonth() - (HISTORY_MONTHS - 1 - i));
    return { month, amount: latestByMonth.get(month)?.totalAmountDue ?? null };
  });
};
