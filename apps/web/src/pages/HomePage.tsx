import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Container,
  Grid,
  Typography,
} from '@mui/material';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

export const HomePage: React.FC = () => {
  const { t } = useTranslation('common');
  const { t: tCards } = useTranslation('cards');
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        {t('nav.home')}
      </Typography>
      {user && (
        <Typography variant="body1" color="text.secondary" mb={4}>
          {t('home.welcomeBack', { username: user.username })}
          {user.panMasked && (
            <> &nbsp;&bull;&nbsp; {t('home.panLabel')}: {user.panMasked}</>
          )}
        </Typography>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={4}>
          <Card
            variant="outlined"
            sx={{ cursor: 'pointer', '&:hover': { boxShadow: 3 } }}
            onClick={() => navigate('/credit-cards')}
            role="button"
            aria-label={tCards('pageTitle')}
          >
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <CreditCardIcon color="primary" />
                <Typography variant="h6" fontWeight={600}>
                  {tCards('pageTitle')}
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                {tCards('pageSubtitle')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Container>
  );
};
