import React from 'react';
import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { formatInr } from '../../utils/format';
import { useAmountReveal } from '../../hooks/useAmountReveal';
import { MASKED_SX, RevealButton } from './RevealButton';

interface MaskedAmountProps {
  readonly value: number;
  /** Names the amount for the show/hide button, e.g. "Amount due". */
  readonly label: string;
}

/**
 * Hidden by default; while hidden the real value is not rendered, so it cannot be read from the DOM.
 * Follows the page's show-all switch whenever it flips, and can still be toggled on its own.
 */
export const MaskedAmount: React.FC<MaskedAmountProps> = ({ value, label }) => {
  const { t } = useTranslation('cards');
  const { isRevealed, toggle } = useAmountReveal();

  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
      <Typography variant="caption" fontWeight={600} sx={isRevealed ? undefined : MASKED_SX}>
        {isRevealed ? formatInr(value) : t('amount.masked')}
      </Typography>
      <RevealButton isRevealed={isRevealed} onToggle={toggle} label={label} size="small" />
    </Box>
  );
};
