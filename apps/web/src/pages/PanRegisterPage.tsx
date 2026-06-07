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
import { useTranslation } from 'react-i18next';
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

export const PanRegisterPage: React.FC = () => {
  const { t } = useTranslation('pan');
  const { setPan } = useAuth();
  const navigate = useNavigate();
  const [apiError, setApiError] = useState<string | null>(null);

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
      navigate('/', { replace: true });
    } catch {
      setApiError(t('errors.registrationFailed'));
    }
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
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};
