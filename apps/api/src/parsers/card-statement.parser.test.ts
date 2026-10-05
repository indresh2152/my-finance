import type { ParsedEmail } from '../services/mailbox/providers/mail-provider';
import { createCardStatementParser, extractCardName } from './card-statement.parser';

const parser = createCardStatementParser({
  issuingBank: 'HDFC',
  senders: ['@hdfcbank.net'],
  bankWords: ['hdfc'],
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

  it.each([
    ['due by', 'Payment due by October 16, 2026', '2026-10-16'],
    ['due on', 'Payment due on 16/10/2026', '2026-10-16'],
    ['due on or before', 'Payment due on or before 16/10/2026', '2026-10-16'],
  ])('should read a due date written as "%s"', (_wording, dueText, dueDate) => {
    const result = parser.parse(email({ text: `Card XX1234 Total Amount Due: Rs. 5 ${dueText}` }));
    expect(result).toMatchObject({ dueDate });
  });

  it.each([
    ['from … to', 'for the period from 29/08/2026 to 28/09/2026', '2026-09-28'],
    ['… to', 'for the period August 29, 2026 to September 28, 2026', '2026-09-28'],
    ['ending', 'for the period ending 04 Sep 2026', '2026-09-04'],
    ['ending on', 'for the period ending on 04 Sep 2026', '2026-09-04'],
    ['two "to"s', 'for the period pertaining to 29 Aug 2026 to 28 Sep 2026', '2026-09-28'],
  ])('should take the statement date from a subject period "%s"', (_form, period, date) => {
    const text = 'Card XX1234 Total Amount Due: Rs. 5 Payment Due Date: 25/09/2026';
    const result = parser.parse(email({ subject: `Credit Card Statement ${period}`, text }));
    expect(result).toMatchObject({ statementDate: date });
  });

  it('should not take an as-of "Amount Due on" date as the due date', () => {
    const text =
      'Card XX1234 Amount due on 05/09/2026. Total Amount Due: Rs. 5,000. Payment Due Date: 25/09/2026';
    expect(parser.parse(email({ text }))).toMatchObject({ dueDate: '2026-09-25' });
  });

  it('should prefer the statement date in the body over the subject period', () => {
    const result = parser.parse(
      email({ subject: 'Credit Card Statement for the period 01/08/2026 to 31/08/2026' }),
    );
    expect(result).toMatchObject({ statementDate: '2026-09-05' });
  });

  it('should not read a statement period from the body', () => {
    const text = `Card XX1234 for the period 01/08/2026 to 31/08/2026. Total Amount Due: Rs. 5. Payment Due Date: 25/09/2026`;
    expect(parser.parse(email({ text }))).toMatchObject({ statementDate: '2026-09-06' });
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

  it('should name a card whose email never shows its digits', () => {
    const result = parser.parse(
      email({
        subject: 'Your HDFC Bank Pixel Play Credit Card Statement for Sep 2026',
        text: 'Total Amount Due: Rs. 500 Payment Due Date: 25/09/2026',
      }),
    );
    expect(result).toMatchObject({ cardName: 'Pixel Play' });
    expect(result).not.toHaveProperty('last4');
  });

  it('should take only a number next to "card" from the body', () => {
    const text =
      'Call us at *2345. Registered mobile XXXXXX5678. Total Amount Due: Rs. 5 Payment Due Date: 25/09/2026';
    const result = parser.parse(
      email({ subject: 'Your HDFC Bank Pixel Play Credit Card Statement', text }),
    );
    expect(result).toMatchObject({ cardName: 'Pixel Play' });
    expect(result).not.toHaveProperty('last4');
  });

  it("should not take a worked example's card digits for the card's", () => {
    const text =
      'Total Amount Due: Rs. 5 Payment Due Date: 25/09/2026. The statement is password protected. If your card number is XXXX XXXX XXXX 5648 the password is RAKE5648.';
    const result = parser.parse(
      email({ subject: 'Your HDFC Bank Pixel Play Credit Card Statement', text }),
    );
    expect(result).toMatchObject({ cardName: 'Pixel Play' });
    expect(result).not.toHaveProperty('last4');
  });

  it('should find the summary table after a prose mention of the total', () => {
    const text = [
      'Card XX1234. Your total amount due for September 2026 is shown below.',
      'Total Amount Due',
      'INR Minimum Amount Due',
      '(INR) Payment Due Date',
      '(DD-MM-YYYY)',
      '488 Dr 100 Dr 03/10/2026',
    ].join('\n');
    expect(parser.parse(email({ text }))).toMatchObject({ totalDue: 488, dueDate: '2026-10-03' });
  });

  it('should cap a long card name at the column width', () => {
    const long = 'Abcdefghijklmnopqrstu';
    const name = extractCardName(`${long} ${long} ${long} Credit Card Statement`, []);
    expect(name).toHaveLength(60);
  });

  it('should keep a statement with nothing due and no due date', () => {
    const result = parser.parse(
      email({ text: 'Card XX1234 Total Amount Due: Rs. 0.00 Payment Due Date: No Payment Due' }),
    );
    expect(result).toMatchObject({ totalDue: 0 });
    expect(result).not.toHaveProperty('dueDate');
  });

  it('should read a summary laid out as a table, with a credit balance', () => {
    const text = [
      'Card XX1234',
      'Total Amount Due',
      'INR Minimum Amount Due',
      '(INR) Payment Due Date',
      '(DD-MM-YYYY)',
      '410 Cr 0 Cr 02/09/2026',
    ].join('\n');
    expect(parser.parse(email({ text }))).toMatchObject({
      totalDue: -410,
      minDue: 0,
      dueDate: '2026-09-02',
    });
  });

  it('should drop a statement with an amount due but no due date', () => {
    expect(parser.parse(email({ text: 'Card XX1234 Total Amount Due: Rs. 500' }))).toBeNull();
  });
});

describe('extractCardName', () => {
  it.each([
    ['Your HDFC Bank Pixel Play Credit Card Statement for Sep 2026', ['hdfc'], 'Pixel Play'],
    ['Your Scapia Federal credit card statement for September, 2026', ['federal'], 'Scapia'],
    ['Federal Bank One Credit Card statement for September 2026', ['federal'], 'One'],
    ['Aug-2026 Statement for Zen Credit Card X0958', ['kotak'], 'Zen'],
    ['Amazon Pay ICICI Bank Credit Card Statement', ['icici'], 'Amazon Pay'],
    ['Indresh, your Scapia Federal credit card statement', ['federal'], 'Scapia'],
    ['Your HDFC Bank - Pixel Play Credit Card Statement', ['hdfc'], 'Pixel Play'],
    ['Your HDFC Bank PIXEL Play Credit Card Statement', ['hdfc'], 'Pixel Play'],
    ['Your HDFC Bank Pixel Play RuPay Credit Card Statement', ['hdfc'], 'Pixel Play'],
    ['Hi Indresh your Scapia Federal credit card statement', ['federal'], 'Scapia'],
  ])('should read the card name in %p', (subject, bankWords, expected) => {
    expect(extractCardName(subject, bankWords)).toBe(expected);
  });

  it.each([
    'ICICI Bank Credit Card Statement for the period September 3 2026 to October 2 2026',
    'Your Sep 2026 Credit Card Statement',
    'Statement of your account',
    "Important: Your HDFC Bank's Credit Card Statement",
    'Indresh your Kotak credit card statement',
    'Your Latest Credit Card Statement is here',
  ])('should find no card name in %p', (subject) => {
    expect(extractCardName(subject, ['icici', 'kotak'])).toBeNull();
  });
});
