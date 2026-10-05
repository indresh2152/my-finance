import {
  extractAccount,
  extractAccountKind,
  istEndOfDay,
  labelledBalance,
  parseBalanceAmount,
  labelledAmount,
  labelledDate,
  extractCardLast4,
  extractLast4,
  findPdfAttachment,
  istDate,
  parseIndianDate,
  parseInrAmount,
} from './fields';

describe('parseInrAmount', () => {
  it.each([
    ['Rs. 12,345.67', 12345.67],
    ['Rs 1,00,000', 100000],
    ['INR 620.00', 620],
    ['₹ 9,99,999.5', 999999.5],
    ['12,345', 12345],
    ['Rs. 1,234.00 Cr', -1234],
    ['Rs. 1,234.00 Dr', 1234],
    ['Rs. 0.00 Cr', 0],
  ])('should parse %s', (raw, expected) => {
    expect(parseInrAmount(raw)).toBe(expected);
  });

  it.each([
    ['Total Amount Due: Rs. 12,345.00/-', 12345],
    ['Total Amount Due: Rs. 500/-', 500],
  ])('should read %p with the Indian "/-" suffix', (text, expected) => {
    expect(labelledAmount(/total amount due/)(text)).toBe(expected);
  });

  it.each(['', 'Rs.', 'NIL', 'abc 12'])('should reject %p', (raw) => {
    expect(parseInrAmount(raw)).toBeNull();
  });
});

describe('parseBalanceAmount', () => {
  it.each([
    ['Rs. 1,234.00', 1234],
    ['INR 1,234.00 Cr', 1234],
    ['INR 1,234.00 Dr', -1234],
    ['Rs. 0.00 Dr', 0],
  ])('should parse %s', (raw, expected) => {
    expect(parseBalanceAmount(raw)).toBe(expected);
  });

  it('should reject a non-amount', () => {
    expect(parseBalanceAmount('NIL')).toBeNull();
  });

  it.each([
    ['Avl Bal: INR 50.00 Dr', -50],
    ['Avl Bal: -5,000.00', -5000],
    ['Avl Bal:-5,000.00', 5000],
    ['Avl Bal - Rs. 5,000', 5000],
    ['Avl Bal as on 29-09-2026: INR 5,000.00', 5000],
    ['Avl Bal 31-08-2026 Rs 5,000', 5000],
  ])('should read the labelled balance in %p', (text, expected) => {
    expect(labelledBalance(/avl bal/)(text)).toBe(expected);
  });

  it('should not read a balance from the next line', () => {
    expect(
      labelledBalance(/closing bal/)('Opening Balance  Closing Bal\n1,000.00  5,000.00'),
    ).toBeNull();
  });
});

describe('parseIndianDate', () => {
  it.each([
    ['05-09-2026', '2026-09-05'],
    ['05/09/2026', '2026-09-05'],
    ['5.9.2026', '2026-09-05'],
    ['05/09/26', '2026-09-05'],
    ['05 Sep 2026', '2026-09-05'],
    ['05-Sep-2026', '2026-09-05'],
    ['5 September, 2026', '2026-09-05'],
    ['25 Sept 2026', '2026-09-25'],
    ['September 25, 2026', '2026-09-25'],
    ['Sep 25 2026', '2026-09-25'],
  ])('should parse %s', (raw, expected) => {
    expect(parseIndianDate(raw)).toBe(expected);
  });

  it.each(['31/02/2026', '05 Foo 2026', 'Foo 05, 2026', '2026', 'soon'])(
    'should reject %p',
    (raw) => {
      expect(parseIndianDate(raw)).toBeNull();
    },
  );
});

describe('labelledAmount / labelledDate', () => {
  const text = [
    'Please pay the Total Amount Due before the due date.',
    'Total Amount Due: Rs. 12,345.67',
    'Minimum Amount Due - INR 620.00',
    'Payment Due Date\n25/09/2026',
  ].join('\n');

  it('should read the value right after a label, skipping mentions without a value', () => {
    expect(labelledAmount(/total\s+amount\s+due/)(text)).toBe(12345.67);
    expect(labelledAmount(/minimum\s+amount\s+due/)(text)).toBe(620);
    expect(labelledDate(/payment\s+due\s+date/)(text)).toBe('2026-09-25');
  });

  it('should read past a currency in brackets or a wide table gap', () => {
    expect(labelledAmount(/total\s+amount\s+due/)('Total Amount Due (Rs.) 1,200.00')).toBe(1200);
    expect(labelledAmount(/total\s+amount\s+due/)(`Total Amount Due${' '.repeat(30)}₹99`)).toBe(99);
  });

  it('should return null when the label is absent', () => {
    expect(labelledAmount(/reward\s+points/)(text)).toBeNull();
    expect(labelledDate(/statement\s+date/)(text)).toBeNull();
  });
});

describe('extractCardLast4', () => {
  it.each([
    ['Your Credit Card Statement for Card No. XXXX XXXX XXXX 1234', '1234'],
    ['Axis Bank Credit Card statement. Your card number XXXX XXXX XXXX 1234', '1234'],
    ['ICICI Bank Credit Card XX4008', '4008'],
  ])('should read the card number after "card" in %p', (text, expected) => {
    expect(extractCardLast4(text)).toBe(expected);
  });

  it('should ignore masked numbers away from "card"', () => {
    expect(
      extractCardLast4('Registered mobile XXXXXX5678. Your card statement is ready.'),
    ).toBeNull();
  });
});

describe('extractLast4', () => {
  it.each([
    ['Card No: XXXX XXXX XXXX 1234', '1234'],
    ['Card 4375 XXXX XXXX 5678 statement', '5678'],
    ['Credit Card XX9012', '9012'],
    ['card number **** 3456', '3456'],
    ['your card ending 7890', '7890'],
    ['card ending with 2468', '2468'],
    ['mobile XXXXXX5678, card ending 1234', '1234'],
    ['Statement for Zen Credit Card X0958', '0958'],
  ])('should find the last 4 digits in %p', (text, expected) => {
    expect(extractLast4(text)).toBe(expected);
  });

  it('should return null without a masked number', () => {
    expect(extractLast4('Your statement is ready')).toBeNull();
    expect(extractLast4('PO Box1234, Mumbai and 0x1234 and *2345')).toBeNull();
  });
});

describe('hostile input', () => {
  const FAST_MS = 250;
  const timed = (work: () => unknown): number => {
    const start = Date.now();
    work();
    return Date.now() - start;
  };

  it('should reject a long run of mask characters quickly', () => {
    expect(timed(() => extractLast4(`${'X'.repeat(50_000)}!`))).toBeLessThan(FAST_MS);
    expect(timed(() => extractLast4(`${'X X '.repeat(20_000)}!`))).toBeLessThan(FAST_MS);
  });

  it('should reject a label followed by a long gap quickly', () => {
    const text = `Total Amount Due${' '.repeat(20_000)}x`;
    expect(timed(() => labelledAmount(/total\s+amount\s+due/)(text))).toBeLessThan(FAST_MS);
  });
});

describe('findPdfAttachment', () => {
  it('should pick the PDF by MIME type or extension', () => {
    const logo = { locator: '1', filename: 'logo.png', mimeType: 'image/png' };
    const pdf = { locator: '2', filename: 'Statement.PDF', mimeType: 'application/octet-stream' };
    expect(findPdfAttachment([logo, pdf])).toBe(pdf);
    expect(findPdfAttachment([{ ...logo, mimeType: 'application/pdf' }])?.locator).toBe('1');
    expect(findPdfAttachment([logo])).toBeNull();
  });
});

describe('extractAccount', () => {
  it.each([
    ['A/c no. XX1234', '1234'],
    ['a/c **5678 debited', '5678'],
    ['Account Number: XXXX XXXX 9012', '9012'],
    ['Acct ending with 3456', '3456'],
    ['Mobile XXXXXX9876, Account XX2468', '2468'],
  ])('should read %p', (text, expected) => {
    expect(extractAccount(text)?.last4).toBe(expected);
  });

  it.each([
    'Card XX1234',
    'Account balance is Rs. 100',
    'A/c XX123 only',
    'Rs 1500.00 credited to your account 2500.00',
    '',
  ])('should return null for %p', (text) => {
    expect(extractAccount(text)).toBeNull();
  });

  it('should take the account kind only from the words right before the number', () => {
    expect(extractAccount('Savings A/c XX1234')).toEqual({ last4: '1234', kind: 'SAVINGS' });
    expect(extractAccount('Current Account no. XX1234')).toEqual({
      last4: '1234',
      kind: 'CURRENT',
    });
    expect(extractAccount('A/c XX1234. Open a Savings Account today!')).toEqual({
      last4: '1234',
    });
  });
});

describe('extractAccountKind', () => {
  it.each([
    ['Your Savings Account Statement', 'SAVINGS'],
    ['Current A/c balance', 'CURRENT'],
    ['Account balance', undefined],
  ])('should read %p', (text, expected) => {
    expect(extractAccountKind(text)).toBe(expected);
  });
});

describe('istEndOfDay', () => {
  it('should return the last millisecond of the day in IST', () => {
    expect(istEndOfDay('2026-09-28').toISOString()).toBe('2026-09-28T18:29:59.999Z');
  });
});

describe('istDate', () => {
  it('should give the calendar date in India', () => {
    expect(istDate(new Date('2026-09-04T20:00:00Z'))).toBe('2026-09-05');
    expect(istDate(new Date('2026-09-05T10:00:00Z'))).toBe('2026-09-05');
  });
});
