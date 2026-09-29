import { useMutation, useQueryClient } from '@tanstack/react-query';
import { downloadStatement } from '../services/credit-cards.api';
import { apiErrorCode } from '../services/api';
import { saveFile } from '../utils/download';
import { MAILBOXES_QUERY_KEY } from '../services/mailbox.api';

const GENERIC_ERROR = 'generic';
const REAUTH_REQUIRED = 'MAILBOX_REAUTH_REQUIRED';

export interface StatementDownload {
  download: (statementId: string) => void;
  /** One download at a time: every Download button is disabled while one runs. */
  isDownloading: boolean;
  errorCode: string | null;
  clearError: () => void;
}

export const useStatementDownload = (): StatementDownload => {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: downloadStatement,
    onSuccess: ({ blob, filename }) => saveFile(blob, filename),
    // The server has just parked the mailbox; reload it so the Reconnect button appears.
    onError: (err) => {
      if (apiErrorCode(err) === REAUTH_REQUIRED) {
        void queryClient.invalidateQueries({ queryKey: MAILBOXES_QUERY_KEY });
      }
    },
  });

  return {
    download: mutation.mutate,
    isDownloading: mutation.isPending,
    errorCode: mutation.error ? (apiErrorCode(mutation.error) ?? GENERIC_ERROR) : null,
    clearError: mutation.reset,
  };
};
