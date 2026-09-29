import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Container, Grid, Typography } from '@mui/material';
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
            <>
              {' '}
              &nbsp;&bull;&nbsp; {t('home.panLabel')}: {user.panMasked}
            </>
          )}
        </Typography>
      )}

      {user && !user.hasPan && (
        <Alert
          severity="info"
          sx={{ mb: 3 }}
          action={
            <Button color="inherit" size="small" onClick={() => navigate('/pan-register')}>
              {t('home.linkPanAction')}
            </Button>
          }
        >
          {t('home.linkPanPrompt')}
        </Alert>
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
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CreditCardIcon color="primary" />
                <Typography variant="h6" fontWeight={600}>
                  {tCards('pageTitle')}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Container>
  );
};
