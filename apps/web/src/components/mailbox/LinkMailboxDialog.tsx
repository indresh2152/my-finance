import React from 'react';
import { Box, Dialog, DialogContent, DialogTitle, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useTranslation } from 'react-i18next';
import { AddMailboxForm } from './AddMailboxForm';

const TITLE_ID = 'link-mailbox-title';

interface LinkMailboxDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

export const LinkMailboxDialog: React.FC<LinkMailboxDialogProps> = ({ open, onClose }) => {
  const { t } = useTranslation('mailbox');

  return (
    <Dialog open={open} onClose={onClose} aria-labelledby={TITLE_ID} fullWidth maxWidth="sm">
      <DialogTitle id={TITLE_ID} sx={{ pr: 6 }}>
        {t('add.title')}
        <IconButton
          aria-label={t('add.close')}
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {/* MUI drops DialogContent's top padding after a title, which would clip the field's label. */}
        <Box pt={1}>
          <AddMailboxForm />
        </Box>
      </DialogContent>
    </Dialog>
  );
};
