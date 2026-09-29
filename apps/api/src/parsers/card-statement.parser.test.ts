import type { ParsedEmail } from '../services/mailbox/providers/mail-provider';
import { createCardStatementParser } from './card-statement.parser';

const parser = createCardStatementParser({
  issuingBank: 'HDFC',
  senders: ['@hdfcbank.net'],
  subject: /credit card.*statement/i,
});

const HINT =
  'The attached statement is password protected. The password is the first 4 letters of your name in capitals and DDMM of birth.';

const email = (overrides: Partial<ParsedEmail> = {}): ParsedEmail => ({
  id: 'msg-1',
  from: 'emailstatements.cards@hdfcbank.net',
  subject: 'Your HDFC Bank Credit Card Statement',
  receivedAt: new Date('2026-09-06T04:00:00Z'),
  text: [
    'Credit Card No. XXXX XXXX XXXX 1234',
    'Statement Date: 05/09/2026',
    'Total Amount Due: Rs. 12,345.67',
    'Minimum Amount Due: Rs. 620.00',
    'Payment Due Date: 25/09/2026',
    HINT,
  ].join('\n'),
  attachments: [{ locator: '2', filename: 'statement.pdf', mimeType: 'application/pdf' }],
  ...overrides,
});

describe('createCardStatementParser', () => {
  it('should derive the key from the bank code', () => {
    expect(parser.key).toBe('hdfc.cc-statement');
  });

  it('should match on the subject pattern', () => {
    expect(parser.matches({ from: 'x', subject: 'Credit Card e-Statement for Sep' })).toBe(true);
    expect(parser.matches({ from: 'x', subject: 'Transaction alert' })).toBe(false);
  });

  it('should parse every field from a full statement email', () => {
    expect(parser.parse(email())).toEqual({
      kind: 'CARD_STATEMENT',
      issuingBank: 'HDFC',
      last4: '1234',
      statementDate: '2026-09-05',
      dueDate: '2026-09-25',
      totalDue: 12345.67,
      minDue: 620,
      passwordHint: HINT,
      attachment: { locator: '2', filename: 'statement.pdf' },
    });
  });

  it('should leave out optional fields the email does not have', () => {
    const result = parser.parse(
      email({
        text: 'Card ending 1234. Total Amount Due: Rs. 500. Payment Due Date: 25 Sep 2026.',
        attachments: [],
      }),
    );
    expect(result).toEqual({
      kind: 'CARD_STATEMENT',
      issuingBank: 'HDFC',
      last4: '1234',
      statementDate: '2026-09-06',
      dueDate: '2026-09-25',
      totalDue: 500,
    });
  });

  it('should take the card from the subject over a masked number in the body', () => {
    const result = parser.parse(
      email({
        subject: 'Credit Card Statement for card ending 4321',
        text: 'Registered mobile XXXXXX5678. Total Amount Due: Rs. 5. Payment Due Date: 25/09/2026',
      }),
    );
    expect(result).toMatchObject({ last4: '4321' });
  });

  it('should read only the start of a very long body', () => {
    const text = `${'filler '.repeat(4000)}Card XX1234 Total Amount Due: Rs. 500 Payment Due Date: 25/09/2026`;
    expect(parser.parse(email({ text }))).toBeNull();
  });

  it.each([
    ['last 4 digits', 'Total Amount Due: Rs. 500. Payment Due Date: 25/09/2026'],
    ['total due', 'Card XX1234. Payment Due Date: 25/09/2026'],
    ['due date', 'Card XX1234. Total Amount Due: Rs. 500'],
  ])('should return null without the %s', (_missing, text) => {
    expect(parser.parse(email({ subject: 'Credit Card Statement', text }))).toBeNull();
  });
});
