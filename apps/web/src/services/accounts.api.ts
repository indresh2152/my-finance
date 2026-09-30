import apiClient from './api';

export type BankAccountType = 'SAVINGS' | 'CURRENT' | 'FD' | 'RD' | 'NRE' | 'NRO' | 'OTHER';

/** A bank account found in email, with the newest balance any linked mailbox has seen. */
export interface EmailAccount {
  id: string;
  bankName: string;
  accountNumberLast4: string;
  accountType: BankAccountType;
  availableBalance: number;
  /** ISO timestamp the balance was reported at. */
  balanceAsOf: string;
}

export const EMAIL_ACCOUNTS_QUERY_KEY = ['email-accounts'] as const;

export const listEmailAccounts = async (): Promise<EmailAccount[]> =>
  (await apiClient.get<{ data: EmailAccount[] }>('/mailboxes/accounts')).data.data;
