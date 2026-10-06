/** Matches EMAIL cards known only by name on the day of month their statements are generated. */

const DAYS_IN_CYCLE = 31;

/**
 * How far a statement day may be from a card's cycle day and still be that card. Covers month-end
 * (a 31st cycle closes on 28 Feb) and statements dated by when the email arrived.
 */
const CYCLE_DAY_TOLERANCE = 3;

/** Day of month (1–31) of a YYYY-MM-DD date. */
export const dayOfMonth = (isoDate: string): number => Number(isoDate.slice(8, 10));

/** Days between two days of month, wrapping around month-end (30 and 1 are 2 apart). */
const cycleDayDistance = (a: number, b: number): number => {
  const gap = Math.abs(a - b);
  return Math.min(gap, DAYS_IN_CYCLE - gap);
};

export interface CycleDayCandidate {
  readonly id: string;
  readonly billing_cycle_day: number | null;
}

/** The candidate whose cycle day is nearest `day` within tolerance, or null when none is. */
export const findByCycleDay = (
  candidates: readonly CycleDayCandidate[],
  day: number,
): CycleDayCandidate | null => {
  let best: CycleDayCandidate | null = null;
  let bestDistance = CYCLE_DAY_TOLERANCE + 1;
  for (const candidate of candidates) {
    if (candidate.billing_cycle_day === null) continue;
    const distance = cycleDayDistance(candidate.billing_cycle_day, day);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
};
