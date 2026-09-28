import React, { useEffect, useState, type FormEvent } from 'react';
import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import {
  apiErrorCode,
  connectMailbox,
  resolveMailbox,
  type ResolveResult,
} from '../../services/mailbox.api';
import { redirectTo } from '../../services/navigation';

export const MAILBOX_EMAIL_INPUT_ID = 'mailbox-email';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_ERROR = 'generic';

export const AddMailboxForm: React.FC = () => {
  const { t } = useTranslation('mailbox');
  const [email, setEmail] = useState('');
  const [resolution, setResolution] = useState<ResolveResult | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  // Back from the provider's consent page can restore this page from bfcache with isBusy still true.
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent): void => {
      if (event.persisted) setIsBusy(false);
    };
    window.addEventListener('pageshow', handlePageShow);
    return (): void => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  const trimmedEmail = email.trim();
  const isValid = EMAIL_PATTERN.test(trimmedEmail);
  const showInvalid = email !== '' && !isValid;

  const handleEmailChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    setEmail(event.target.value);
    setResolution(null);
    setErrorCode(null);
  };

  const handleResolve = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!isValid) return;
    setIsBusy(true);
    setErrorCode(null);
    try {
      setResolution(await resolveMailbox(trimmedEmail));
    } catch (err) {
      setErrorCode(apiErrorCode(err) ?? GENERIC_ERROR);
    } finally {
      setIsBusy(false);
    }
  };

  const handleConnect = async (): Promise<void> => {
    setIsBusy(true);
    setErrorCode(null);
    try {
      redirectTo(await connectMailbox(trimmedEmail));
    } catch (err) {
      setErrorCode(apiErrorCode(err) ?? GENERIC_ERROR);
      setIsBusy(false);
    }
  };

  return (
    <Box
      component="form"
      onSubmit={(event: FormEvent) => {
        void handleResolve(event);
      }}
      noValidate
    >
      <Typography variant="h6" gutterBottom>
        {t('add.title')}
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="flex-start">
        <TextField
          id={MAILBOX_EMAIL_INPUT_ID}
          label={t('add.emailLabel')}
          type="email"
          size="small"
          fullWidth
          value={email}
          onChange={handleEmailChange}
          error={showInvalid}
          helperText={showInvalid ? t('add.invalidEmail') : ' '}
        />
        <Button type="submit" variant="outlined" disabled={!isValid || isBusy}>
          {t('add.check')}
        </Button>
      </Stack>

      {resolution?.supported && (
        <Button
          variant="contained"
          sx={{ mt: 1 }}
          disabled={isBusy}
          onClick={() => {
            void handleConnect();
          }}
        >
          {t('add.continueWith', { provider: t(`provider.${resolution.provider}`) })}
        </Button>
      )}
      {resolution && !resolution.supported && (
        <Alert severity="info" sx={{ mt: 1 }}>
          {t('add.unsupported')}
        </Alert>
      )}
      {errorCode && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {t(`errors.${errorCode}`, { defaultValue: t('errors.generic') })}
        </Alert>
      )}

      <Typography variant="caption" color="text.secondary" display="block" mt={1}>
        {t('add.explainer')}
      </Typography>
    </Box>
  );
};
