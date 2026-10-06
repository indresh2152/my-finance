import type { CardStatement } from '../../services/credit-cards.api';
import { HISTORY_MONTHS, monthlyAmounts } from './statementMonths';

const statement = (statementDate: string, totalAmountDue: number): CardStatement => ({
  id: statementDate,
  statementDate,
  dueDate: null,
  totalAmountDue,
  minimumAmountDue: null,
  passwordHint: null,
  downloadAvailable: false,
});

const TODAY = new Date('2026-10-06T08:00:00Z');

describe('monthlyAmounts', () => {
  it('should cover the current month and the 11 before it, oldest first, across a year end', () => {
    const months = monthlyAmounts([], TODAY).map((m) => m.month);
    expect(months).toHaveLength(HISTORY_MONTHS);
    expect(months[0]).toBe('2025-11');
    expect(months).toContain('2026-01');
    expect(months[HISTORY_MONTHS - 1]).toBe('2026-10');
  });

  it("should place each statement's amount in its month and leave other months empty", () => {
    const result = monthlyAmounts(
      [statement('2026-09-05', 1200), statement('2026-07-05', 800)],
      TODAY,
    );
    const byMonth = Object.fromEntries(result.map((m) => [m.month, m.amount]));
    expect(byMonth['2026-09']).toBe(1200);
    expect(byMonth['2026-07']).toBe(800);
    expect(byMonth['2026-08']).toBeNull();
  });

  it('should take the later statement when a month has two', () => {
    const result = monthlyAmounts(
      [statement('2026-09-02', 100), statement('2026-09-28', 900), statement('2026-09-15', 500)],
      TODAY,
    );
    expect(result.find((m) => m.month === '2026-09')?.amount).toBe(900);
  });

  it('should ignore statements outside the 12 months', () => {
    const result = monthlyAmounts([statement('2025-10-05', 999)], TODAY);
    expect(result.every((m) => m.amount === null)).toBe(true);
  });
});
