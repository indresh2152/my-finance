import React from 'react';
import { Alert } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { LinkNotice } from '../../hooks/useMailboxes';

interface MailboxAlertsProps {
  /** The OAuth-callback result; only the page the callback lands on has one. */
  readonly notice?: LinkNotice;
  readonly onCloseNotice?: () => void;
  readonly actionError: string | null;
  readonly onCloseActionError: () => void;
}

/** The OAuth-callback result and any refresh/unlink failure, each dismissible. */
export const MailboxAlerts: React.FC<MailboxAlertsProps> = ({
  notice = null,
  onCloseNotice,
  actionError,
  onCloseActionError,
}) => {
  const { t } = useTranslation('mailbox');
  const translateError = (code: string): string =>
    t(`errors.${code}`, { defaultValue: t('errors.generic') });

  return (
    <>
      {notice && (
        <Alert severity={notice.severity} onClose={onCloseNotice}>
          {notice.severity === 'success' ? t('notices.linked') : translateError(notice.code)}
        </Alert>
      )}
      {actionError && (
        <Alert severity="error" onClose={onCloseActionError}>
          {translateError(actionError)}
        </Alert>
      )}
    </>
  );
};
