import React from 'react';
import { Typography } from '@mui/material';

interface PageTitleProps {
  readonly children: React.ReactNode;
}

/** A page's one h1, styled the same on every page. */
export const PageTitle: React.FC<PageTitleProps> = ({ children }) => (
  <Typography variant="h4" component="h1" fontWeight={700}>
    {children}
  </Typography>
);
