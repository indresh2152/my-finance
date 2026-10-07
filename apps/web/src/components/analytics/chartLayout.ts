import { axisClasses } from '@mui/x-charts/ChartsAxis';

/** Equal side margins; the left one holds the tick values and the y-axis label. */
export const CHART_MARGIN = { left: 85, right: 85, top: 20, bottom: 60 } as const;

/** Moves each axis label clear of the tick values beside it. */
export const AXIS_LABEL_SX = {
  [`& .${axisClasses.left} .${axisClasses.label}`]: { transform: 'translateX(-20px)' },
  [`& .${axisClasses.bottom} .${axisClasses.label}`]: { transform: 'translateY(16px)' },
} as const;
