import type { ParsedEmail } from '../../services/mailbox/providers/mail-provider';
import { ParserRegistry } from '../registry';
import { htmlToText } from '../../utils/html-to-text';
import { CARD_STATEMENT_PARSERS } from './card-statements';

// Synthetic emails following each bank's publicly known wording; no real samples exist yet.
const registry = new ParserRegistry(CARD_STATEMENT_PARSERS);
const PDF = { locator: 'att-1', filename: 'statement.pdf', mimeType: 'application/pdf' };

const email = (from: string, subject: string, text: string): ParsedEmail => ({
  id: 'msg-1',
  from,
  subject,
  receivedAt: new Date('2026-09-06T04:00:00Z'),
  text,
  attachments: [PDF],
});

const FIXTURES: Array<[string, ParsedEmail, Record<string, unknown>]> = [
  [
    'HDFC',
    email(
      'emailstatements.cards@hdfcbank.net',
      'Your HDFC Bank Regalia Credit Card Statement for September 2026',
      [
        'Credit Card No. 4375 XXXX XXXX 1234',
        'Statement Date: 05/09/2026',
        'Total Amount Due: Rs. 12,345.67',
        'Minimum Amount Due: Rs. 620.00',
        'Payment Due Date: 25/09/2026',
        'To open the attached statement, enter the first 4 letters of your name in capitals and the last 4 digits of your card as the password.',
      ].join('\n'),
    ),
    {
      issuingBank: 'HDFC',
      last4: '1234',
      statementDate: '2026-09-05',
      dueDate: '2026-09-25',
      totalDue: 12345.67,
      minDue: 620,
    },
  ],
  [
    'ICICI',
    email(
      'credit_cards@icicibank.com',
      'ICICI Bank Credit Card XX5678 Statement for the period ending 04 Sep 2026',
      [
        'Your ICICI Bank Credit Card XX5678 statement is attached.',
        'Total Amount due: INR 8,000.00',
        'Minimum Amount due: INR 400.00',
        'Payment Due Date: September 22, 2026',
        'The statement PDF is password protected. Password: first four letters of your name in lower case followed by your date of birth in DDMM format.',
      ].join('\n'),
    ),
    {
      issuingBank: 'ICICI',
      last4: '5678',
      statementDate: '2026-09-04',
      dueDate: '2026-09-22',
      totalDue: 8000,
      minDue: 400,
    },
  ],
  [
    'SBI Card',
    email(
      'statements@sbicard.com',
      'Your SBI Card Monthly Statement - Sep 2026',
      [
        'SBI Card ending 9012',
        'Statement Date 03 Sep 2026',
        'Total Amount Due ₹25,000.00',
        'Minimum Amount Due ₹1,250.00',
        'Payment Due Date 23 Sep 2026',
        'To open your e-statement, use your date of birth (DDMMYYYY) and last 4 digits of your card as the password.',
      ].join('\n'),
    ),
    {
      issuingBank: 'SBI_CARD',
      last4: '9012',
      statementDate: '2026-09-03',
      dueDate: '2026-09-23',
      totalDue: 25000,
      minDue: 1250,
    },
  ],
  [
    'Axis',
    email(
      'cc.statements@axisbank.com',
      'Your Axis Bank Credit Card Statement ending XX3456',
      [
        'Card No: XXXX XXXX XXXX 3456',
        'Statement Date: 07-09-2026',
        'Total Payment Due: Rs. 3,210.50',
        'Minimum Payment Due: Rs. 200.00',
        'Payment Due Date: 27-09-2026',
        'Your statement is password protected. The password is the first 4 letters of your name (in capitals) followed by DDMM of your date of birth.',
      ].join('\n'),
    ),
    {
      issuingBank: 'AXIS',
      last4: '3456',
      statementDate: '2026-09-07',
      dueDate: '2026-09-27',
      totalDue: 3210.5,
      minDue: 200,
    },
  ],
  [
    'Kotak',
    email(
      'cardstatement@kotak.com',
      'Kotak Credit Card Statement for September 2026',
      [
        'Credit Card Number: XXXXXXXXXXXX7890',
        'Statement Date: 08-Sep-2026',
        'Total Amount Due: Rs. 0.00 Cr',
        'Minimum Amount Due: Rs. 0.00',
        'Due Date: 28-Sep-2026',
        'The attached statement can be opened with your CRN as the password.',
      ].join('\n'),
    ),
    {
      issuingBank: 'KOTAK',
      last4: '7890',
      statementDate: '2026-09-08',
      dueDate: '2026-09-28',
      totalDue: 0,
      minDue: 0,
    },
  ],
];

describe('card statement parsers', () => {
  it.each(FIXTURES)('should parse a %s statement email', (_bank, fixture, expected) => {
    const parser = registry.find({ from: fixture.from, subject: fixture.subject });
    const result = parser?.parse(fixture);
    expect(result).toMatchObject({
      kind: 'CARD_STATEMENT',
      ...expected,
      attachment: { locator: 'att-1', filename: 'statement.pdf' },
    });
    expect(result).toHaveProperty('passwordHint', expect.stringMatching(/password/i));
  });

  it('should parse the layout of a real Amazon Pay ICICI statement email', () => {
    const html = [
      '<h1>Credit Card Statement</h1>',
      '<div><h2>Payment due</h2><p>by October 16, 2026</p></div>',
      '<table><tr><td>ICICI Bank Credit Card</td><td>XX0019</td></tr></table>',
      '<p>Minimum Amount Due: &#x20B9;770.00</p>',
      '<p>Total Amount Due:</p><p><b>&#x20B9;15,398.51</b></p>',
      '<p>Pay now using:</p>',
    ].join('');
    const fixture = email(
      'credit_cards@icici.bank.in',
      'Amazon Pay ICICI Bank Credit Card Statement for the period August 29, 2026 to September 28, 2026',
      htmlToText(html),
    );
    const parser = registry.find({ from: fixture.from, subject: fixture.subject });
    expect(parser?.parse(fixture)).toMatchObject({
      issuingBank: 'ICICI',
      last4: '0019',
      statementDate: '2026-09-28',
      dueDate: '2026-10-16',
      totalDue: 15398.51,
      minDue: 770,
    });
  });

  it.each([
    ['a savings account statement', 'alerts@hdfcbank.net', 'Your HDFC Bank Account Statement'],
    [
      'a card transaction alert',
      'alerts@icicibank.com',
      'Transaction alert for your ICICI Bank Credit Card',
    ],
    ['a look-alike sender', 'statements@fakesbicard.com', 'Your SBI Card Monthly Statement'],
  ])('should not pick a parser for %s', (_case, from, subject) => {
    expect(registry.find({ from, subject })).toBeNull();
  });

  it('should have one parser per bank', () => {
    expect(CARD_STATEMENT_PARSERS.map((parser) => parser.key)).toEqual([
      'hdfc.cc-statement',
      'icici.cc-statement',
      'sbi_card.cc-statement',
      'axis.cc-statement',
      'kotak.cc-statement',
    ]);
  });
});
