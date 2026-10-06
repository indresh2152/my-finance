import React from 'react';
import { IconButton, Tooltip } from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { useTranslation } from 'react-i18next';

interface ShowAllToggleProps {
  readonly showAll: boolean;
  readonly onToggle: () => void;
}

/** Shows or hides every masked amount on the page at once. */
export const ShowAllToggle: React.FC<ShowAllToggleProps> = ({ showAll, onToggle }) => {
  const { t } = useTranslation('cards');
  // A toggle keeps one name and reports its state through aria-pressed; only the tooltip changes.
  return (
    <Tooltip title={t(showAll ? 'amount.hideAll' : 'amount.showAll')}>
      <IconButton aria-label={t('amount.showAll')} aria-pressed={showAll} onClick={onToggle}>
        {showAll ? <VisibilityOffIcon /> : <VisibilityIcon />}
      </IconButton>
    </Tooltip>
  );
};
