/** Rupee steps for the chart's amount axis, from ₹5K to ₹1Cr (a crore multiple above that); the axis always starts at 0. */
const CRORE = 10_000_000;
const STEPS = [
  5_000, 10_000, 25_000, 50_000, 100_000, 200_000, 500_000, 1_000_000, 2_500_000, 5_000_000,
  10_000_000,
] as const;

/**
 * Tick values for the log-like amount axis that holds `maxAmount`: 0, then each step up to the first one at
 * or above the largest amount. Even steps keep small amounts readable beside a few large ones.
 */
export const amountTicks = (maxAmount: number): number[] => {
  const top = STEPS.findIndex((step) => step >= maxAmount);
  if (top !== -1) return [0, ...STEPS.slice(0, top + 1)];
  // Beyond ₹1Cr the axis ends at the next whole crore so the largest amount stays on the chart.
  return [0, ...STEPS, Math.ceil(maxAmount / CRORE) * CRORE];
};

/** Amounts below this spread out almost evenly; above it each doubling takes the same height. */
const LOG_KNEE = 10_000;

/**
 * Where an amount sits on the chart's axis: a logarithm that starts at 0 for ₹0, so the many small
 * amounts take much more height than on a linear axis while the largest ones still fit.
 */
export const toAxis = (amount: number): number => Math.log10(1 + amount / LOG_KNEE);

/** The amount (to the paisa) that sits at `position` on the axis; the inverse of toAxis. */
export const fromAxis = (position: number): number =>
  Math.round(LOG_KNEE * (10 ** position - 1) * 100) / 100;
