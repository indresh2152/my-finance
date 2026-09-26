import React from 'react';
import { Box } from '@mui/material';
import { useTranslation } from 'react-i18next';

const API_DOCS_URL = '/api/docs/';

/**
 * Embeds the server-rendered Swagger UI below the app header so users can
 * return to the dashboard via the header. Same-origin framing is permitted by
 * helmet's default `frame-ancestors 'self'`.
 */
export const ApiDocsPage: React.FC = () => {
  const { t } = useTranslation('common');

  return (
    <Box
      component="iframe"
      src={API_DOCS_URL}
      title={t('nav.apiDocs')}
      sx={{
        display: 'block',
        width: '100%',
        border: 0,
        height: { xs: 'calc(100vh - 56px)', sm: 'calc(100vh - 64px)' },
      }}
    />
  );
};
