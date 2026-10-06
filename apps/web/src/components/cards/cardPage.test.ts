import type { CreditCard } from '../../services/credit-cards.api';
import { cardLabel, cardPagePath, cardsInMailbox } from './cardPage';

const card = { issuingBank: 'HDFC Bank', cardName: null, cardNumberLast4: '4242' } as CreditCard;

describe('cardPagePath', () => {
  it("should link to the card's page", () => {
    expect(cardPagePath('card-1')).toBe('/cards/card-1');
  });
});

describe('cardLabel', () => {
  it('should name the card by bank and masked number', () => {
    expect(cardLabel(card)).toBe('HDFC Bank •••• 4242');
  });

  it("should prefer the card's name", () => {
    expect(cardLabel({ ...card, cardName: 'Regalia' })).toBe('HDFC Bank Regalia');
  });

  it('should fall back to the bank alone', () => {
    expect(cardLabel({ ...card, cardNumberLast4: null })).toBe('HDFC Bank');
  });
});

describe('cardsInMailbox', () => {
  const inA = { ...card, id: 'a', mailboxIds: ['mb-a'] };
  const inBoth = { ...card, id: 'b', mailboxIds: ['mb-a', 'mb-b'] };
  const nowhere = { ...card, id: 'c', mailboxIds: [] };

  it('should keep every card for the all filter', () => {
    expect(cardsInMailbox([inA, inBoth, nowhere], 'all')).toEqual([inA, inBoth, nowhere]);
  });

  it('should keep only the cards found in the chosen mailbox', () => {
    expect(cardsInMailbox([inA, inBoth, nowhere], 'mb-b')).toEqual([inBoth]);
  });
});
