import React, { useContext, useState } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { useTranslation } from 'react-i18next';
import { formatInr } from '../../utils/format';
import { AmountVisibilityContext } from '../../context/AmountVisibilityContext';

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
  const showAll = useContext(AmountVisibilityContext);
  const [isRevealed, setRevealed] = useState(showAll);
  const [followedShowAll, setFollowedShowAll] = useState(showAll);
  // Adjusting state during render (not in an effect) avoids a frame showing the old state.
  if (followedShowAll !== showAll) {
    setFollowedShowAll(showAll);
    setRevealed(showAll);
  }

  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
      <Typography
        variant="caption"
        fontWeight={600}
        sx={isRevealed ? undefined : { filter: 'blur(4px)', userSelect: 'none' }}
      >
        {isRevealed ? formatInr(value) : t('amount.masked')}
      </Typography>
      <IconButton
        size="small"
        aria-label={t(isRevealed ? 'amount.hide' : 'amount.show', { label })}
        onClick={() => setRevealed((revealed) => !revealed)}
      >
        {isRevealed ? (
          <VisibilityOffIcon fontSize="inherit" />
        ) : (
          <VisibilityIcon fontSize="inherit" />
        )}
      </IconButton>
    </Box>
  );
};
