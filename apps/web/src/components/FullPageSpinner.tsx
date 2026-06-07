import React from 'react';
import { Box, CircularProgress } from '@mui/material';

export const FullPageSpinner: React.FC = () => (
  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
    <CircularProgress />
  </Box>
);
