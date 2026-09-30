import type { ParsedEmail } from '../services/mailbox/providers/mail-provider';
import { createAccountBalanceParser } from './account-balance.parser';
import type { AccountBalanceResult } from './email-parser';

const parser = createAccountBalanceParser({ bankName: 'HDFC', senders: ['@hdfcbank.net'] });
const parse = (message: ParsedEmail): AccountBalanceResult | null =>
  parser.parse(message) as AccountBalanceResult | null;
const RECEIVED_AT = new Date('2026-09-29T04:30:00Z');

const email = (overrides: Partial<ParsedEmail> = {}): ParsedEmail => ({
  id: 'msg-1',
  from: 'alerts@hdfcbank.net',
  subject: 'Balance update for your HDFC Bank Savings Account',
  receivedAt: RECEIVED_AT,
  text: 'Your A/c XX1234 has an Available Balance of Rs. 1,23,456.78',
  attachments: [],
  ...overrides,
});

describe('createAccountBalanceParser', () => {
  it('should derive the key from the bank code and filter on balance and statement subjects', () => {
    expect(parser.key).toBe('hdfc.balance');
    expect(parser.subjectKeywords).toEqual(['balance', 'statement', 'estatement']);
  });

  it.each([
    'Balance update for your HDFC Bank A/c',
    'Your Account Statement for September 2026',
    'Savings Account e-Statement',
    'Statement of Account XX1234',
  ])('should match %p', (subject) => {
    expect(parser.matches({ from: 'x', subject })).toBe(true);
  });

  it.each([
    'Your HDFC Bank Credit Card Statement',
    'Credit Card outstanding balance reminder',
    'Your Home Loan Account Statement',
    'PPF Account Statement',
    'Demat Account Statement for September',
    'Transaction alert',
    'OTP for login',
  ])('should not match %p', (subject) => {
    expect(parser.matches({ from: 'x', subject })).toBe(false);
  });

  it('should parse the account, balance and type, dated when the email arrived', () => {
    expect(parse(email())).toEqual({
      kind: 'ACCOUNT_BALANCE',
      bankName: 'HDFC',
      last4: '1234',
      balance: 123456.78,
      asOf: RECEIVED_AT.toISOString(),
      accountType: 'SAVINGS',
    });
  });

  it('should detect a current account and leave the type out when unknown', () => {
    expect(
      parse(email({ subject: 'Balance alert', text: 'Current Account XX1234 Avl Bal INR 10' }))
        ?.accountType,
    ).toBe('CURRENT');
    expect(
      parse(email({ subject: 'Balance alert', text: 'A/c XX1234 Avl Bal INR 10' })),
    ).not.toHaveProperty('accountType');
  });

  it('should not take the account type from unrelated body text', () => {
    const result = parse(
      email({
        subject: 'Balance alert',
        text: 'A/c XX1234 Avl Bal INR 10. Open a Savings Account today!',
      }),
    );
    expect(result).not.toHaveProperty('accountType');
  });

  it('should read the amount after the date a balance is stated for', () => {
    const result = parse(email({ text: 'Your A/c XX1234 Avl Bal as on 29-09-2026: INR 5,000.00' }));
    expect(result?.balance).toBe(5000);
  });

  it('should read a Cr balance as positive and a Dr balance as overdrawn', () => {
    const cr = email({ text: 'A/c no. XX1234. Avl. Bal: INR 5,000.00 Cr' });
    const dr = email({ text: 'A/c no. XX1234. Avl. Bal: INR 5,000.00 Dr' });
    expect(parse(cr)?.balance).toBe(5000);
    expect(parse(dr)?.balance).toBe(-5000);
  });

  it('should read a balance stated in a sentence, dated at the end of the stated day (IST)', () => {
    const result = parse(
      email({
        receivedAt: new Date('2026-09-30T04:00:00Z'),
        text: 'The available balance in your a/c **5678 as on 28-09-2026 is Rs. 9,000.50.',
      }),
    );
    expect(result).toMatchObject({
      last4: '5678',
      balance: 9000.5,
      asOf: '2026-09-28T18:29:59.999Z',
    });
  });

  it('should date a statement balance at the end of its period', () => {
    const result = parse(
      email({
        subject: 'Your Account Statement for August 2026',
        text: 'Statement for the period 01/08/2026 to 31/08/2026\nAccount No. XXXXXXXX4321\nClosing Balance: Rs. 42,000.00',
      }),
    );
    expect(result).toMatchObject({
      last4: '4321',
      balance: 42000,
      asOf: '2026-08-31T18:29:59.999Z',
    });
  });

  it('should never date a balance after the email arrived', () => {
    const result = parse(email({ text: 'A/c XX1234 Avl Bal Rs. 10 as on 29-09-2026' }));
    expect(result?.asOf).toBe(RECEIVED_AT.toISOString());
  });

  it('should ignore a masked mobile number and take the account number', () => {
    const result = parse(
      email({
        text: 'Registered mobile XXXXXX9876. Account ending 2468. Available Balance: ₹ 100',
      }),
    );
    expect(result?.last4).toBe('2468');
  });

  it.each([
    ['no account number', 'Available Balance: Rs. 100'],
    ['no balance', 'Your A/c XX1234 statement is attached.'],
    ['a card limit, not a balance', 'Card XX1234 Available credit limit: Rs. 50,000'],
  ])('should return null with %s', (_label, text) => {
    expect(parse(email({ text }))).toBeNull();
  });
});
