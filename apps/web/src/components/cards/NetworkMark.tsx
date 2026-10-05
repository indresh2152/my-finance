import React from 'react';
import { Box, Typography, type TypographyProps } from '@mui/material';
import { useTranslation } from 'react-i18next';

const MASTERCARD_RED = '#EB001B';
const MASTERCARD_YELLOW = '#F79E1B';
const MASTERCARD_OVERLAP = '#FF5F00';

/** Two overlapping circles, drawn rather than shipped as an image file. */
const MastercardMark: React.FC<{ readonly label: string }> = ({ label }) => (
  <Box component="svg" viewBox="0 0 38 24" width={38} height={24} role="img" aria-label={label}>
    <circle cx="12" cy="12" r="11" fill={MASTERCARD_RED} />
    <circle cx="26" cy="12" r="11" fill={MASTERCARD_YELLOW} />
    <path d="M19 3.5a11 11 0 0 1 0 17a11 11 0 0 1 0-17z" fill={MASTERCARD_OVERLAP} />
  </Box>
);

interface Wordmark {
  readonly variant: TypographyProps['variant'];
  readonly italic?: boolean;
  readonly boxed?: boolean;
}

const WORDMARKS: Readonly<Record<string, Wordmark>> = {
  VISA: { variant: 'h6', italic: true },
  RUPAY: { variant: 'subtitle1', italic: true },
  AMEX: { variant: 'caption', boxed: true },
  DINERS: { variant: 'caption' },
};

interface NetworkMarkProps {
  /** As stored: VISA, MASTERCARD, AMEX, RUPAY, DINERS, OTHER, or null when an email did not say. */
  readonly network: string | null;
}

/** The card network's mark, in the face's text colour; nothing when the network is unknown. */
export const NetworkMark: React.FC<NetworkMarkProps> = ({ network }) => {
  const { t } = useTranslation('cards');
  if (network === 'MASTERCARD') return <MastercardMark label={t('networks.MASTERCARD')} />;
  const wordmark = network ? WORDMARKS[network] : undefined;
  if (!wordmark) return null;
  return (
    <Typography
      variant={wordmark.variant}
      component="span"
      fontStyle={wordmark.italic ? 'italic' : undefined}
      sx={{
        color: 'inherit',
        fontWeight: 800,
        letterSpacing: 0.5,
        lineHeight: 1,
        ...(wordmark.boxed && { border: 1, px: 0.5, py: 0.25 }),
      }}
    >
      {t(`networks.${network}` as 'networks.VISA')}
    </Typography>
  );
};
