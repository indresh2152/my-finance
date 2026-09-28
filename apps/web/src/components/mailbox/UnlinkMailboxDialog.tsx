import React from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { Mailbox } from '../../services/mailbox.api';

interface UnlinkMailboxDialogProps {
  readonly mailbox: Mailbox | null;
  readonly isBusy: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: (mailbox: Mailbox) => void;
}

export const UnlinkMailboxDialog: React.FC<UnlinkMailboxDialogProps> = ({
  mailbox,
  isBusy,
  onCancel,
  onConfirm,
}) => {
  const { t } = useTranslation('mailbox');

  return (
    <Dialog open={mailbox !== null} onClose={onCancel} aria-labelledby="unlink-mailbox-title">
      {mailbox && (
        <>
          <DialogTitle id="unlink-mailbox-title">
            {t('unlinkDialog.title', { email: mailbox.emailMasked })}
          </DialogTitle>
          <DialogContent>
            <DialogContentText>{t('unlinkDialog.body')}</DialogContentText>
            {mailbox.provider === 'MICROSOFT' && (
              <DialogContentText sx={{ mt: 1 }}>
                {t('unlinkDialog.microsoftNote')}
              </DialogContentText>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={onCancel}>{t('unlinkDialog.cancel')}</Button>
            <Button
              color="error"
              variant="contained"
              disabled={isBusy}
              onClick={() => onConfirm(mailbox)}
            >
              {t('unlinkDialog.confirm')}
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
};
