import { createCardStatementParser } from '../card-statement.parser';
import type { EmailParser } from '../email-parser';

/** SBI Card mails only about cards, so any statement from it is a card statement. */
const ANY_STATEMENT = /statement/i;

/**
 * Sender domains include the `.bank.in` domains RBI requires banks to move to. Written from public
 * templates, not real mail: after the first real sync, check the MAILBOX_SYNC audit counts
 * (scanned = 0 means a sender is wrong; scanned > 0 with parsed = 0 means a pattern is wrong).
 */
export const CARD_STATEMENT_PARSERS: readonly EmailParser[] = [
  createCardStatementParser({
    issuingBank: 'HDFC',
    senders: ['@hdfcbank.net', '@hdfcbank.com', '@hdfc.bank.in'],
  }),
  createCardStatementParser({
    issuingBank: 'ICICI',
    senders: ['@icicibank.com', '@icici.bank.in'],
  }),
  createCardStatementParser({
    issuingBank: 'SBI_CARD',
    senders: ['@sbicard.com'],
    subject: ANY_STATEMENT,
  }),
  createCardStatementParser({ issuingBank: 'AXIS', senders: ['@axisbank.com', '@axis.bank.in'] }),
  createCardStatementParser({
    issuingBank: 'KOTAK',
    senders: ['@kotak.com', '@kotakbank.com', '@kotak.bank.in'],
  }),
];
