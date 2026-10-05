import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Button } from '@mui/material';
import { useTranslation } from 'react-i18next';

interface LinkPanAlertProps {
  /** Why this page needs a PAN. */
  readonly message: string;
}

/** Asks a user who skipped PAN registration to link one, with a button to /pan-register. */
export const LinkPanAlert: React.FC<LinkPanAlertProps> = ({ message }) => {
  const { t } = useTranslation('common');
  return (
    <Alert
      severity="info"
      action={
        <Button color="inherit" size="small" component={RouterLink} to="/pan-register">
          {t('linkPanAction')}
        </Button>
      }
    >
      {message}
    </Alert>
  );
};
