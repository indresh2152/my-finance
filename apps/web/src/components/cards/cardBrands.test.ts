import { cardDesign } from './cardBrands';

const bankOnly = (issuingBank: string): ReturnType<typeof cardDesign> =>
  cardDesign(issuingBank, null);

describe('cardDesign', () => {
  it.each([
    ['HDFC', 'HDFC'],
    ['HDFC Bank', 'HDFC'],
    ['HDFC Bank Ltd.', 'HDFC'],
    ['icici bank', 'ICICI'],
    ['SBI_CARD', 'SBI_CARD'],
    ['SBI Card', 'SBI_CARD'],
    ['State Bank of India', 'SBI'],
    ['AXIS', 'AXIS'],
    ['Kotak Mahindra Bank', 'KOTAK'],
    ['FEDERAL', 'FEDERAL'],
  ])('should resolve %s to the %s brand', (issuingBank, code) => {
    expect(bankOnly(issuingBank).bankCode).toBe(code);
  });

  it('should give email codes and typed names the same face', () => {
    expect(bankOnly('SBI_CARD')).toEqual(bankOnly('SBI Card'));
  });

  it('should put an unknown bank on a neutral face', () => {
    const design = bankOnly('Yes Bank');
    expect(design.bankCode).toBeNull();
    expect(design.background).toBe(bankOnly('Another Bank').background);
    expect(design.background).not.toBe(bankOnly('HDFC').background);
    expect(design.ink).toBe('light');
  });

  it.each([
    ['HDFC', 'Pixel Play', 'dark'],
    ['HDFC Bank', 'Pixel Go', 'dark'],
    ['ICICI', 'Coral', 'light'],
    ['ICICI', 'Amazon Pay', 'light'],
    ['FEDERAL', 'Scapia', 'light'],
    ['FEDERAL', 'OneCard', 'light'],
    ['FEDERAL', 'One', 'light'],
    ['Federal Bank', 'One Card', 'light'],
    ['AXIS', 'Flipkart', 'light'],
    ['KOTAK', 'Zen', 'light'],
    ['ICICI', 'Sapphiro', 'light'],
  ])("should use %s %s's own design", (issuingBank, cardName, ink) => {
    const design = cardDesign(issuingBank, cardName);
    expect(design.background).not.toBe(bankOnly(issuingBank).background);
    expect(design.ink).toBe(ink);
    expect(design.bankCode).toBe(bankOnly(issuingBank).bankCode);
  });

  it("should not apply a product's design to another bank's card of that name", () => {
    expect(cardDesign('AXIS', 'Pixel')).toEqual(bankOnly('AXIS'));
  });

  it("should not take another Federal card starting with 'One' for OneCard", () => {
    expect(cardDesign('FEDERAL', 'Onesta Rewards')).toEqual(bankOnly('FEDERAL'));
  });

  it('should use the bank design for a card name with no product design', () => {
    expect(cardDesign('HDFC', 'Regalia')).toEqual(bankOnly('HDFC'));
  });
});
