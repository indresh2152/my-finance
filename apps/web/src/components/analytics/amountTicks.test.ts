import { amountTicks, fromAxis, toAxis } from './amountTicks';

describe('amountTicks', () => {
  it('should stop at the first step that holds the largest amount', () => {
    expect(amountTicks(700_000)).toEqual([
      0, 5_000, 10_000, 25_000, 50_000, 100_000, 200_000, 500_000, 1_000_000,
    ]);
  });

  it('should keep a minimum of one step for small or zero amounts', () => {
    expect(amountTicks(0)).toEqual([0, 5_000]);
    expect(amountTicks(1_200)).toEqual([0, 5_000]);
  });

  it('should include an amount that is exactly a step', () => {
    expect(amountTicks(50_000).slice(-1)[0]).toBe(50_000);
  });

  it('should reach the next whole crore for an amount above ₹1Cr', () => {
    expect(amountTicks(25_000_000).slice(-1)[0]).toBe(30_000_000);
  });
});

describe('toAxis and fromAxis', () => {
  it('should put ₹0 at the bottom of the axis', () => {
    expect(toAxis(0)).toBe(0);
  });

  it('should give small amounts more room than a straight scale would', () => {
    expect(toAxis(25_000) / toAxis(1_000_000)).toBeGreaterThan(0.2);
  });

  it('should keep amounts in order', () => {
    expect(toAxis(5_000)).toBeLessThan(toAxis(10_000));
  });

  it.each([0, 1, 4_999.5, 12_345.67, 700_000, 10_000_000])('should round-trip %s', (amount) => {
    expect(fromAxis(toAxis(amount))).toBe(amount);
  });
});
