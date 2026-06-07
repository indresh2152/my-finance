import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box,
  Card,
  CardContent,
  Chip,
  Container,
  Grid,
  Typography,
  Alert,
  Skeleton,
  Stack,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import apiClient from '../services/api';
import { useAuth } from '../context/AuthContext';

interface CreditCard {
  id: string;
  cardNumberLast4: string;
  cardNetwork: string;
  issuingBank: string;
  cardVariant: string;
  expiryMonth: number;
  expiryYear: number;
  nameOnCard: string;
  status: string;
  creditLimit: number | null;
  availableCredit: number | null;
  currentBalance: number | null;
}

interface CreditCardsResponse {
  cards: CreditCard[];
}

const INR_FORMATTER = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

const formatINR = (amount: number | null): string =>
  amount === null ? '—' : INR_FORMATTER.format(amount);

const statusColor = (status: string): 'success' | 'error' | 'warning' | 'default' => {
  if (status === 'ACTIVE') return 'success';
  if (status === 'BLOCKED') return 'error';
  if (status === 'EXPIRED') return 'warning';
  return 'default';
};

const CardSkeleton: React.FC = () => (
  <Card variant="outlined">
    <CardContent>
      <Skeleton variant="text" width="60%" height={28} />
      <Skeleton variant="text" width="40%" />
      <Skeleton variant="rectangular" height={60} sx={{ mt: 1, borderRadius: 1 }} />
    </CardContent>
  </Card>
);

export const CreditCardsPage: React.FC = () => {
  const { t } = useTranslation('cards');
  const { t: tCommon } = useTranslation('common');
  const { user } = useAuth();

  const { data, isLoading, isError } = useQuery<CreditCardsResponse>({
    queryKey: ['credit-cards'],
    queryFn: async () => {
      const { data: res } = await apiClient.get<CreditCardsResponse>('/credit-cards');
      return res;
    },
    enabled: !!user?.hasPan,
  });

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        {t('pageTitle')}
      </Typography>
      <Typography variant="body1" color="text.secondary" mb={3}>
        {t('pageSubtitle')}
      </Typography>

      {isLoading && (
        <Grid container spacing={2}>
          {[1, 2, 3].map((i) => (
            <Grid item xs={12} sm={6} md={4} key={i}>
              <CardSkeleton />
            </Grid>
          ))}
        </Grid>
      )}

      {isError && (
        <Alert severity="error">{t('errors.loadFailed')}</Alert>
      )}

      {!isLoading && !isError && (
        data?.cards.length === 0 ? (
          <Alert severity="info">
            {t('emptyState')}
            <Box mt={0.5}>
              <Typography variant="caption" color="text.secondary">
                {t('emptyStateHint')}
              </Typography>
            </Box>
          </Alert>
        ) : (
          <Grid container spacing={2}>
            {data?.cards.map((card) => (
            <Grid item xs={12} sm={6} md={4} key={card.id}>
              <Card variant="outlined" sx={{ height: '100%' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="subtitle1" fontWeight={700}>
                      {card.issuingBank}
                    </Typography>
                    <Chip
                      label={tCommon(`status.${card.status.toLowerCase()}` as 'status.active')}
                      color={statusColor(card.status)}
                      size="small"
                    />
                  </Box>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {card.cardNetwork} •••• {card.cardNumberLast4}
                  </Typography>
                  <Stack spacing={0.5} mt={1}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="caption" color="text.secondary">
                        {t('creditLimit')}
                      </Typography>
                      <Typography variant="caption" fontWeight={600}>
                        {formatINR(card.creditLimit)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="caption" color="text.secondary">
                        {t('availableCredit')}
                      </Typography>
                      <Typography variant="caption" fontWeight={600}>
                        {formatINR(card.availableCredit)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="caption" color="text.secondary">
                        {t('currentBalance')}
                      </Typography>
                      <Typography variant="caption" fontWeight={600}>
                        {formatINR(card.currentBalance)}
                      </Typography>
                    </Box>
                  </Stack>
                  <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                    {t('expiresOn')} {String(card.expiryMonth).padStart(2, '0')}/{card.expiryYear}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
          </Grid>
        )
      )}
    </Container>
  );
};
