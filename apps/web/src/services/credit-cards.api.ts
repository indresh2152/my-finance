import apiClient from './api';

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
}

export const CREDIT_CARDS_QUERY_KEY = ['credit-cards'] as const;

export const listCreditCards = async (): Promise<CreditCard[]> =>
  (await apiClient.get<{ cards: CreditCard[] }>('/credit-cards')).data.cards;
