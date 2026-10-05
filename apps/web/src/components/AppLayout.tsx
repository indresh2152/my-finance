import React, { Suspense } from 'react';
import { Outlet, Link as RouterLink } from 'react-router-dom';
import { AppBar, Box, Button, Container, Toolbar, Typography } from '@mui/material';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import { useTranslation } from 'react-i18next';
import { UserMenu } from './UserMenu';
import { FullPageSpinner } from './FullPageSpinner';

export const AppLayout: React.FC = () => {
  const { t } = useTranslation('common');
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="static" elevation={1}>
        <Toolbar>
          <AccountBalanceWalletIcon sx={{ mr: 1 }} />
          <Typography
            variant="h6"
            component={RouterLink}
            to="/"
            sx={{ flexGrow: 1, color: 'inherit', textDecoration: 'none', fontWeight: 700 }}
          >
            {t('appName')}
          </Typography>

          <Button
            color="inherit"
            component={RouterLink}
            to="/api-docs"
            sx={{ mr: 1, display: { xs: 'none', sm: 'inline-flex' } }}
          >
            {t('nav.apiDocs')}
          </Button>

          <UserMenu />
        </Toolbar>
      </AppBar>

      <Box component="main" sx={{ flexGrow: 1 }}>
        <Container maxWidth={false} disableGutters>
          {/* Pages load lazily; suspending here keeps the header (and its open menu) mounted. */}
          <Suspense fallback={<FullPageSpinner minHeight="50vh" />}>
            <Outlet />
          </Suspense>
        </Container>
      </Box>
    </Box>
  );
};
