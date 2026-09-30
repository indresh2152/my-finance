import type { ParsedEmail } from '../../services/mailbox/providers/mail-provider';
import { BANK_PARSERS, ParserRegistry } from '../registry';
import { ACCOUNT_BALANCE_PARSERS } from './account-balances';

// Synthetic emails following each bank's publicly known wording; no real samples exist yet.
const registry = new ParserRegistry(BANK_PARSERS);
const RECEIVED_AT = new Date('2026-09-29T04:30:00Z');

const email = (from: string, subject: string, text: string): ParsedEmail => ({
  id: 'msg-1',
  from,
  subject,
  receivedAt: RECEIVED_AT,
  text,
  attachments: [],
});

const FIXTURES: Array<[string, ParsedEmail, Record<string, unknown>]> = [
  [
    'HDFC',
    email(
      'alerts@hdfcbank.net',
      'View: Account balance for your HDFC Bank A/c',
      'Dear Customer, the available balance in your HDFC Bank Savings A/c XX1234 as on 28-09-2026 is INR 1,23,456.78.',
    ),
    { bankName: 'HDFC', last4: '1234', balance: 123456.78, accountType: 'SAVINGS' },
  ],
  [
    'ICICI',
    email(
      'estatement@icicibank.com',
      'ICICI Bank Savings Account Statement for September 2026',
      'Account Number: XXXXXXXX5678\nStatement period: 01-09-2026 to 28-09-2026\nClosing Balance: Rs. 45,000.00 Cr',
    ),
    { bankName: 'ICICI', last4: '5678', balance: 45000, accountType: 'SAVINGS' },
  ],
  [
    'SBI',
    email(
      'donotreply.sbiintouch@alerts.sbi.co.in',
      'SBI Account Balance',
      'The balance in your A/c XXXXXXX9012 is Avl Bal Rs. 8,765.43 as on 28/09/26.',
    ),
    { bankName: 'SBI', last4: '9012', balance: 8765.43 },
  ],
  [
    'AXIS',
    email(
      'alerts@axis.bank.in',
      'Axis Bank Current Account Balance Alert',
      'Current Account no. XX3456\nAvailable Balance: INR 2,50,000.00',
    ),
    { bankName: 'AXIS', last4: '3456', balance: 250000, accountType: 'CURRENT' },
  ],
  [
    'KOTAK',
    email(
      'bankalerts@kotak.com',
      'Balance update for your Kotak Bank account',
      'Your Kotak Bank A/c xx7890 Avbl. Bal: Rs. 12,000.00 as of 28 Sep 2026',
    ),
    { bankName: 'KOTAK', last4: '7890', balance: 12000 },
  ],
];

describe('ACCOUNT_BALANCE_PARSERS', () => {
  it('should cover the five banks with unique keys', () => {
    expect(ACCOUNT_BALANCE_PARSERS.map((parser) => parser.key)).toEqual([
      'hdfc.balance',
      'icici.balance',
      'sbi.balance',
      'axis.balance',
      'kotak.balance',
    ]);
  });

  it.each(FIXTURES)('should parse a %s balance email', (_bank, message, expected) => {
    const parser = registry.find({ from: message.from, subject: message.subject });
    expect(parser?.key).toMatch(/\.balance$/);
    expect(parser?.parse(message)).toMatchObject({ kind: 'ACCOUNT_BALANCE', ...expected });
  });

  it('should leave card statements to the card parsers', () => {
    const parser = registry.find({
      from: 'emailstatements.cards@hdfcbank.net',
      subject: 'Your HDFC Bank Credit Card Statement',
    });
    expect(parser?.key).toBe('hdfc.cc-statement');
  });

  it('should not take SBI Card mail as a State Bank of India account', () => {
    const parser = registry.find({ from: 'statements@sbicard.com', subject: 'Account balance' });
    expect(parser).toBeNull();
  });
});
