import apiClient from './api';
import { filenameFromDisposition } from '../utils/download';

/** The latest statement found in email for a card. Dates are YYYY-MM-DD. */
export interface CardStatement {
  id: string;
  statementDate: string;
  /** Null only when nothing is due. */
  dueDate: string | null;
  totalAmountDue: number;
  minimumAmountDue: number | null;
  passwordHint: string | null;
  /** False when the statement email had no PDF. */
  downloadAvailable: boolean;
}

/**
 * Cards found in bank emails carry only the bank and last 4 digits (or, when the bank's emails
 * never show the digits, the card's name); the other details may be null.
 */
export type CardStatus = 'ACTIVE' | 'INACTIVE' | 'BLOCKED' | 'EXPIRED' | 'CLOSED';

export interface CreditCard {
  id: string;
  cardNumberLast4: string | null;
  cardName: string | null;
  cardNetwork: string | null;
  issuingBank: string;
  cardVariant: string;
  expiryMonth: number | null;
  expiryYear: number | null;
  nameOnCard: string | null;
  status: CardStatus;
  creditLimit: number | null;
  availableCredit: number | null;
  currentBalance: number | null;
  latestStatement: CardStatement | null;
  /** Ids of the linked mailboxes this card's statements were found in; empty for none. */
  mailboxIds: string[];
}

export interface StatementFile {
  blob: Blob;
  filename: string;
}

/** A card with up to 12 months of statements, one per billing cycle, newest first. */
export interface CardStatementHistory {
  card: CreditCard;
  statements: CardStatement[];
}

export const CREDIT_CARDS_QUERY_KEY = ['credit-cards'] as const;

/** Under the card list's key, so refreshing the cards refreshes their histories too. */
export const cardStatementsQueryKey = (cardId: string): readonly string[] => [
  ...CREDIT_CARDS_QUERY_KEY,
  cardId,
  'statements',
];

export const listCreditCards = async (): Promise<CreditCard[]> =>
  (await apiClient.get<{ cards: CreditCard[] }>('/credit-cards')).data.cards;

export const getCardStatements = async (cardId: string): Promise<CardStatementHistory> =>
  (
    await apiClient.get<CardStatementHistory>(
      `/credit-cards/${encodeURIComponent(cardId)}/statements`,
    )
  ).data;

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
