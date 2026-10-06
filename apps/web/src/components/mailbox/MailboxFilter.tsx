import React from 'react';
import { MenuItem, TextField } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { Mailbox } from '../../services/mailbox.api';

/** The filter value that shows the cards from every linked mailbox. */
export const ALL_MAILBOXES = 'all';

interface MailboxFilterProps {
  readonly mailboxes: readonly Mailbox[];
  /** ALL_MAILBOXES, or the id of one of `mailboxes`. */
  readonly value: string;
  readonly onChange: (value: string) => void;
}

/** Narrows the dashboard to the cards found in one linked email, shown masked. */
export const MailboxFilter: React.FC<MailboxFilterProps> = ({ mailboxes, value, onChange }) => {
  const { t } = useTranslation('mailbox');
  return (
    <TextField
      select
      size="small"
      label={t('filter.label')}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      sx={{ minWidth: 200 }}
    >
      <MenuItem value={ALL_MAILBOXES}>{t('filter.all')}</MenuItem>
      {mailboxes.map((mailbox) => (
        <MenuItem key={mailbox.id} value={mailbox.id}>
          {mailbox.emailMasked}
        </MenuItem>
      ))}
    </TextField>
  );
};
