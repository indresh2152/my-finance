import React from 'react';
import { Outlet, useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  AppBar,
  Box,
  Button,
  Chip,
  Container,
  IconButton,
  Toolbar,
  Typography,
} from '@mui/material';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import LogoutIcon from '@mui/icons-material/Logout';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

export const AppLayout: React.FC = () => {
  const { t } = useTranslation('common');
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async (): Promise<void> => {
    await logout();
    navigate('/login', { replace: true });
  };

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

          {user?.panMasked && (
            <Chip
              label={user.panMasked}
              size="small"
              sx={{ mr: 2, bgcolor: 'primary.dark', color: 'white', fontFamily: 'monospace' }}
            />
          )}

          <Button
            color="inherit"
            component={RouterLink}
            to="/credit-cards"
            sx={{ mr: 1, display: { xs: 'none', sm: 'inline-flex' } }}
          >
            {t('nav.creditCards')}
          </Button>

          <IconButton
            color="inherit"
            onClick={() => { void handleLogout(); }}
            aria-label={t('logout')}
            title={t('logout')}
          >
            <LogoutIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Box component="main" sx={{ flexGrow: 1 }}>
        <Container maxWidth={false} disableGutters>
          <Outlet />
        </Container>
      </Box>
    </Box>
  );
};
