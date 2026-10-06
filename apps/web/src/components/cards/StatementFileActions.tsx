import React from 'react';
import { Box, Button, IconButton, Tooltip } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useTranslation } from 'react-i18next';
import type { CardStatement } from '../../services/credit-cards.api';

interface StatementFileActionsProps {
  readonly statement: CardStatement;
  readonly isDownloading: boolean;
  /** Absent when mailbox features are off, since the file is fetched from the mailbox. */
  readonly onDownload?: (statementId: string) => void;
  /**
   * Set in a list of statements: the download becomes an icon, and both buttons name the month
   * so each row's buttons can be told apart.
   */
  readonly month?: string;
}

/**
 * Download and the password hint for a statement's PDF. Nothing renders when the email had no
 * PDF, since the hint only opens the PDF.
 */
export const StatementFileActions: React.FC<StatementFileActionsProps> = ({
  statement,
  isDownloading,
  onDownload,
  month,
}) => {
  const { t } = useTranslation('cards');
  if (!statement.downloadAvailable) return null;

  const download = (): void => onDownload?.(statement.id);
  let downloadButton: React.ReactNode = null;
  if (onDownload && month !== undefined) {
    downloadButton = (
      <Tooltip title={t('statement.download')}>
        {/* A disabled button fires no events, so the tooltip needs a wrapper to anchor to. */}
        <span>
          <IconButton
            size="small"
            aria-label={t('history.downloadMonth', { month })}
            disabled={isDownloading}
            onClick={download}
          >
            <DownloadIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    );
  } else if (onDownload) {
    downloadButton = (
      <Button size="small" startIcon={<DownloadIcon />} disabled={isDownloading} onClick={download}>
        {t('statement.download')}
      </Button>
    );
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      {downloadButton}
      <Tooltip title={statement.passwordHint ?? t('statement.noPasswordHint')}>
        <IconButton
          size="small"
          aria-label={
            month === undefined
              ? t('statement.passwordHint')
              : t('history.passwordHintMonth', { month })
          }
        >
          <InfoOutlinedIcon fontSize="inherit" />
        </IconButton>
      </Tooltip>
    </Box>
  );
};
