import type { CreditCard } from '../../services/credit-cards.api';
import { cardLabel, cardPagePath } from './cardPage';

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
