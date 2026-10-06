import React from 'react';
import { Snackbar } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { StatementDownload } from '../../hooks/useStatementDownload';

const DOWNLOAD_ERROR_HIDE_MS = 6000;

/** Statement-specific wording first, then the shared mailbox error text, then a generic message. */
const downloadErrorMessage = (t: TFunction<'cards'>, code: string): string =>
  t([`statement.errors.${code}`, `mailbox:errors.${code}`, 'statement.errors.generic'] as never);

interface DownloadErrorSnackbarProps {
  readonly download: StatementDownload;
}

/** Explains why the last statement download failed. */
export const DownloadErrorSnackbar: React.FC<DownloadErrorSnackbarProps> = ({ download }) => {
  const { t } = useTranslation('cards');
  return (
    <Snackbar
      open={download.errorCode !== null}
      autoHideDuration={DOWNLOAD_ERROR_HIDE_MS}
      onClose={download.clearError}
      message={download.errorCode && downloadErrorMessage(t, download.errorCode)}
    />
  );
};
