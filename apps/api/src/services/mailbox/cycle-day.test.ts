import { dayOfMonth, findByCycleDay } from './cycle-day';

const card = (
  id: string,
  day: number | null,
): { id: string; billing_cycle_day: number | null } => ({
  id,
  billing_cycle_day: day,
});

describe('dayOfMonth', () => {
  it('should read the day of a YYYY-MM-DD date', () => {
    expect(dayOfMonth('2026-09-05')).toBe(5);
    expect(dayOfMonth('2026-02-28')).toBe(28);
  });
});

describe('findByCycleDay', () => {
  const scapia14 = card('card-14', 14);
  const scapia25 = card('card-25', 25);

  it('should tell apart same-named cards by statement day', () => {
    expect(findByCycleDay([scapia14, scapia25], 25)).toBe(scapia25);
    expect(findByCycleDay([scapia14, scapia25], 14)).toBe(scapia14);
  });

  it('should match a statement up to 3 days from the cycle day, and no further', () => {
    expect(findByCycleDay([scapia14], 17)).toBe(scapia14);
    expect(findByCycleDay([scapia14], 11)).toBe(scapia14);
    expect(findByCycleDay([scapia14], 18)).toBeNull();
  });

  it('should match across month-end', () => {
    expect(findByCycleDay([card('eom', 31)], 28)).not.toBeNull(); // a 31st cycle in February
    expect(findByCycleDay([card('late', 30)], 1)).not.toBeNull();
  });

  it('should pick the nearest card when several are within tolerance', () => {
    expect(findByCycleDay([card('far', 11), scapia14], 13)).toBe(scapia14);
  });

  it('should match no card when there are none or none has a cycle day', () => {
    expect(findByCycleDay([], 14)).toBeNull();
    expect(findByCycleDay([card('unknown', null)], 14)).toBeNull();
  });
});
