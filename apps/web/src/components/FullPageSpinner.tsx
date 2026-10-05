import React from 'react';
import { Box, CircularProgress } from '@mui/material';

interface FullPageSpinnerProps {
  /** Below a header, pass less than the full viewport so the page does not overflow. */
  readonly minHeight?: string;
}

export const FullPageSpinner: React.FC<FullPageSpinnerProps> = ({ minHeight = '100vh' }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight }}>
    <CircularProgress />
  </Box>
);
