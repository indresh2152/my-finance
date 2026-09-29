import apiClient from './api';
import { filenameFromDisposition } from '../utils/download';

/** The latest statement found in email for a card. Dates are YYYY-MM-DD. */
export interface CardStatement {
  id: string;
  statementDate: string;
  dueDate: string;
  totalAmountDue: number;
  minimumAmountDue: number | null;
  passwordHint: string | null;
  /** False when the statement email had no PDF. */
  downloadAvailable: boolean;
}

/** Cards found in bank emails carry only the bank and last 4 digits; the other details may be null. */
export interface CreditCard {
  id: string;
  cardNumberLast4: string;
  cardNetwork: string | null;
  issuingBank: string;
  cardVariant: string;
  expiryMonth: number | null;
  expiryYear: number | null;
  nameOnCard: string | null;
  status: string;
  creditLimit: number | null;
  availableCredit: number | null;
  currentBalance: number | null;
  latestStatement: CardStatement | null;
}

export interface StatementFile {
  blob: Blob;
  filename: string;
}

export const CREDIT_CARDS_QUERY_KEY = ['credit-cards'] as const;

export const listCreditCards = async (): Promise<CreditCard[]> =>
  (await apiClient.get<{ cards: CreditCard[] }>('/credit-cards')).data.cards;

export const downloadStatement = async (statementId: string): Promise<StatementFile> => {
  const response = await apiClient.get<Blob>(`/mailboxes/statements/${statementId}/download`, {
    responseType: 'blob',
  });
  const disposition = response.headers['content-disposition'] as string | undefined;
  return {
    blob: response.data,
    filename: filenameFromDisposition(disposition),
  };
};
