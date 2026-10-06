import type { CreditCard } from '../../services/credit-cards.api';
import { maskLast4 } from '../../utils/format';

/** The card's page: its 12-month statement history. */
export const cardPagePath = (cardId: string): string => `/cards/${encodeURIComponent(cardId)}`;

/** Names the card for screen readers: bank, then its name or masked number. */
export const cardLabel = (card: CreditCard): string =>
  [card.issuingBank, card.cardName ?? (card.cardNumberLast4 && maskLast4(card.cardNumberLast4))]
    .filter(Boolean)
    .join(' ');
