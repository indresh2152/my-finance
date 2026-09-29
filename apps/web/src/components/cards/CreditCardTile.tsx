import React from 'react';
import { Box, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { CreditCard } from '../../services/credit-cards.api';

const INR_FORMATTER = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

const statusColor = (status: string): 'success' | 'error' | 'warning' | 'default' => {
  if (status === 'ACTIVE') return 'success';
  if (status === 'BLOCKED') return 'error';
  if (status === 'EXPIRED') return 'warning';
  return 'default';
};

interface AmountRowProps {
  readonly label: string;
  readonly amount: number | null;
}

/** Renders nothing for an unknown amount, which is the norm for cards found in bank emails. */
const AmountRow: React.FC<AmountRowProps> = ({ label, amount }) =>
  amount === null ? null : (
    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="caption" fontWeight={600}>
        {INR_FORMATTER.format(amount)}
      </Typography>
    </Box>
  );

interface CreditCardTileProps {
  readonly card: CreditCard;
}

/** Details a bank email did not reveal (network, expiry, amounts) are left out rather than shown blank. */
export const CreditCardTile: React.FC<CreditCardTileProps> = ({ card }) => {
  const { t } = useTranslation('cards');
  const { t: tCommon } = useTranslation('common');
  const maskedNumber = `•••• ${card.cardNumberLast4}`;

  return (
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
          {card.cardNetwork ? `${card.cardNetwork} ${maskedNumber}` : maskedNumber}
        </Typography>
        <Stack spacing={0.5} mt={1}>
          <AmountRow label={t('creditLimit')} amount={card.creditLimit} />
          <AmountRow label={t('availableCredit')} amount={card.availableCredit} />
          <AmountRow label={t('currentBalance')} amount={card.currentBalance} />
        </Stack>
        {card.expiryMonth !== null && card.expiryYear !== null && (
          <Typography variant="caption" color="text.secondary" display="block" mt={1}>
            {t('expiresOn')} {String(card.expiryMonth).padStart(2, '0')}/{card.expiryYear}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};
