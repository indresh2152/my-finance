import { createCardStatementParser } from '../card-statement.parser';
import type { BankCode, EmailParser } from '../email-parser';
import { BANK_SENDERS } from './senders';

/** SBI Card mails only about cards, so any statement from it is a card statement. */
const ANY_STATEMENT = /statement/i;

const statementParser = (issuingBank: BankCode, subject?: RegExp): EmailParser =>
  createCardStatementParser({ issuingBank, senders: BANK_SENDERS[issuingBank], subject });

export const CARD_STATEMENT_PARSERS: readonly EmailParser[] = [
  statementParser('HDFC'),
  statementParser('ICICI'),
  statementParser('SBI_CARD', ANY_STATEMENT),
  statementParser('AXIS'),
  statementParser('KOTAK'),
];
