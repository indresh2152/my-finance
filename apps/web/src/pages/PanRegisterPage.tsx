import React, { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Container,
  TextField,
  Typography,
  Alert,
  Paper,
  CircularProgress,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import apiClient from '../services/api';

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const panSchema = z.object({
  pan: z.string().min(1, 'validation.required').regex(PAN_REGEX, 'validation.format'),
});

type PanFormData = z.infer<typeof panSchema>;

interface PanRegisterResponse {
  id: string;
  panMasked: string;
  verifiedAt: string | null;
}

const API_ERROR_KEYS: ReadonlyMap<string, string> = new Map([
  ['PAN_VERIFICATION_FAILED', 'errors.verificationFailed'],
  ['PAN_KYC_UNAVAILABLE', 'errors.kycUnavailable'],
  ['PAN_ALREADY_REGISTERED', 'errors.alreadyRegistered'],
  ['PAN_LINKED_TO_ANOTHER_ACCOUNT', 'errors.linkedToAnotherAccount'],
  ['RATE_LIMIT_EXCEEDED', 'errors.rateLimited'],
]);

const resolveApiError = (err: unknown, t: (key: string) => string): string => {
  const code: unknown = axios.isAxiosError(err) ? err.response?.data?.error?.code : undefined;
  const key = typeof code === 'string' ? API_ERROR_KEYS.get(code) : undefined;
  return t(key ?? 'errors.registrationFailed');
};

export const PanRegisterPage: React.FC = () => {
  const { t } = useTranslation('pan');
  const { setPan, skipPan } = useAuth();
  const navigate = useNavigate();
  const [apiError, setApiError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<PanFormData>({
    resolver: zodResolver(panSchema),
    defaultValues: { pan: '' },
  });

  const onSubmit = async (data: PanFormData): Promise<void> => {
    setApiError(null);
    try {
      const { data: result } = await apiClient.post<PanRegisterResponse>('/pan/register', {
        pan: data.pan.toUpperCase(),
      });
      setPan(result.panMasked);
      if (result.verifiedAt !== null) {
        setVerified(true);
        setTimeout(() => navigate('/', { replace: true }), 1500);
      } else {
        navigate('/', { replace: true });
      }
    } catch (err) {
      setApiError(resolveApiError(err, t));
    }
  };

  const handleSkip = (): void => {
    skipPan();
    navigate('/', { replace: true });
  };

  return (
    <Container maxWidth="sm">
      <Box sx={{ mt: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Paper elevation={2} sx={{ p: 4, width: '100%', borderRadius: 3 }}>
          <Typography variant="h5" fontWeight={700} gutterBottom>
            {t('registerTitle')}
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            {t('registerSubtitle')}
          </Typography>

          {verified && (
            <Alert severity="success" icon={<CheckCircleOutlineIcon />} sx={{ mb: 2 }}>
              {t('verifiedMessage')}
            </Alert>
          )}

          {apiError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {apiError}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
            <Controller
              name="pan"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                  label={t('panLabel')}
                  placeholder={t('panPlaceholder')}
                  helperText={
                    fieldState.error
                      ? t(fieldState.error.message as 'validation.required')
                      : t('panHint')
                  }
                  fullWidth
                  margin="normal"
                  error={!!fieldState.error}
                  inputProps={{ maxLength: 10 }}
                />
              )}
            />

            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={isSubmitting}
              sx={{ mt: 2 }}
              startIcon={isSubmitting ? <CircularProgress size={18} color="inherit" /> : undefined}
            >
              {isSubmitting ? t('registering') : t('registerButton')}
            </Button>

            <Button
              variant="text"
              fullWidth
              disabled={isSubmitting}
              onClick={handleSkip}
              sx={{ mt: 1 }}
            >
              {t('skipButton')}
            </Button>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};
