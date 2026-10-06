import React from 'react';
import { IconButton, type IconButtonProps } from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { useTranslation } from 'react-i18next';

/** How a hidden amount looks: a blurred placeholder that cannot be selected. */
export const MASKED_SX = { filter: 'blur(4px)', userSelect: 'none' } as const;

interface RevealButtonProps {
  readonly isRevealed: boolean;
  readonly onToggle: () => void;
  /** Names what is shown or hidden, e.g. "Amount due". */
  readonly label: string;
  readonly size?: IconButtonProps['size'];
}

/** The eye button that shows or hides masked amounts. */
export const RevealButton: React.FC<RevealButtonProps> = ({
  isRevealed,
  onToggle,
  label,
  size,
}) => {
  const { t } = useTranslation('cards');
  const iconSize = size === 'small' ? 'inherit' : undefined;
  return (
    <IconButton
      size={size}
      aria-label={t(isRevealed ? 'amount.hide' : 'amount.show', { label })}
      onClick={onToggle}
    >
      {isRevealed ? (
        <VisibilityOffIcon fontSize={iconSize} />
      ) : (
        <VisibilityIcon fontSize={iconSize} />
      )}
    </IconButton>
  );
};
