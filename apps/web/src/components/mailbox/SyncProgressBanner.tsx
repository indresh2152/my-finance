import React from 'react';
import { Alert, AlertTitle, CircularProgress } from '@mui/material';
import { useTranslation } from 'react-i18next';

const SPINNER_SIZE = 20;

/** Page-level notice shown while any linked mailbox is still being read. `status` keeps screen readers polite. */
export const SyncProgressBanner: React.FC = () => {
  const { t } = useTranslation('mailbox');

  return (
    <Alert severity="info" role="status" icon={<CircularProgress size={SPINNER_SIZE} />}>
      <AlertTitle>{t('progress.title')}</AlertTitle>
      {t('progress.body')}
    </Alert>
  );
};
