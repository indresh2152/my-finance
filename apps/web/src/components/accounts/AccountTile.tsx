import React from 'react';
import { Box, Card, CardContent, Chip, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { EmailAccount } from '../../services/accounts.api';
import { formatIstDate, maskLast4 } from '../../utils/format';
import { MaskedAmount } from '../cards/MaskedAmount';

interface AccountTileProps {
  readonly account: EmailAccount;
}

/** The type chip is left out for OTHER, which only means the email did not say. */
export const AccountTile: React.FC<AccountTileProps> = ({ account }) => {
  const { t } = useTranslation('accounts');
  const balanceLabel = t('availableBalance');

  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="subtitle1" fontWeight={700}>
            {account.bankName}
          </Typography>
          {account.accountType !== 'OTHER' && (
            <Chip label={t(`types.${account.accountType}`)} size="small" variant="outlined" />
          )}
        </Box>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {maskLast4(account.accountNumberLast4)}
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {balanceLabel}
          </Typography>
          <MaskedAmount value={account.availableBalance} label={balanceLabel} />
        </Box>
        <Typography variant="caption" color="text.secondary" display="block" textAlign="right">
          {t('asOf', { date: formatIstDate(account.balanceAsOf) })}
        </Typography>
      </CardContent>
    </Card>
  );
};
