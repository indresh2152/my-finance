import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { EMAIL_ACCOUNTS_QUERY_KEY, listEmailAccounts } from '../../services/accounts.api';
import { TileGrid } from '../TileGrid';
import { AccountTile } from './AccountTile';

const SKELETON_ACCOUNTS = 2;

interface BankAccountsSectionProps {
  /** With a mailbox already linked, the empty state reports that nothing was found rather than asking to link one. */
  readonly hasMailbox: boolean;
}

/**
 * Bank accounts found in linked email. Render only while mailbox features are on: the data comes
 * from /mailboxes. Accounts only ever come from a mailbox, so none is asked for (or audited) until
 * one is linked.
 */
export const BankAccountsSection: React.FC<BankAccountsSectionProps> = ({ hasMailbox }) => {
  const { t } = useTranslation('accounts');
  const { data, isLoading, isError } = useQuery({
    queryKey: EMAIL_ACCOUNTS_QUERY_KEY,
    queryFn: listEmailAccounts,
    enabled: hasMailbox,
  });

  return (
    <Stack component="section" spacing={2} aria-labelledby="bank-accounts-title">
      <Typography id="bank-accounts-title" variant="h5" component="h2" fontWeight={700}>
        {t('sectionTitle')}
      </Typography>
      <TileGrid
        items={hasMailbox ? data : []}
        isLoading={isLoading}
        isError={isError}
        skeletonCount={SKELETON_ACCOUNTS}
        errorText={t('errors.loadFailed')}
        emptyText={t('emptyState')}
        emptyHint={hasMailbox ? t('emptyStateMailboxLinked') : t('emptyStateHint')}
        renderTile={(account) => <AccountTile account={account} />}
      />
    </Stack>
  );
};
