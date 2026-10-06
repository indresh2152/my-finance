import type { CreditCard } from '../../services/credit-cards.api';
import { maskLast4 } from '../../utils/format';
import { ALL_MAILBOXES } from '../mailbox/MailboxFilter';

/** The card's page: its 12-month statement history. */
export const cardPagePath = (cardId: string): string => `/cards/${encodeURIComponent(cardId)}`;

/** Names the card for screen readers: bank, then its name or masked number. */
export const cardLabel = (card: CreditCard): string =>
  [card.issuingBank, card.cardName ?? (card.cardNumberLast4 && maskLast4(card.cardNumberLast4))]
    .filter(Boolean)
    .join(' ');

/** The cards found in the mailbox the dashboard filter selects; every card for ALL_MAILBOXES. */
export const cardsInMailbox = (
  cards: readonly CreditCard[],
  mailboxFilter: string,
): CreditCard[] =>
  mailboxFilter === ALL_MAILBOXES
    ? [...cards]
    : cards.filter((card) => card.mailboxIds.includes(mailboxFilter));
