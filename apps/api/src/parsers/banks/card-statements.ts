import { createCardStatementParser } from '../card-statement.parser';
import type { BankCode, EmailParser } from '../email-parser';
import { BANK_NAME_WORDS, BANK_SENDERS } from './senders';

/** SBI Card mails only about cards, so any statement from it is a card statement. */
const ANY_STATEMENT = /statement/i;
/** OneCard also issues cards for other banks from the same sender, so Federal must be named. */
const FEDERAL_STATEMENT = /^(?=.*\bfederal\b)(?=.*credit\s*card)(?=.*statement)/i;

const statementParser = (issuingBank: BankCode, subject?: RegExp): EmailParser =>
  createCardStatementParser({
    issuingBank,
    senders: BANK_SENDERS[issuingBank],
    bankWords: BANK_NAME_WORDS[issuingBank],
    subject,
  });

export const CARD_STATEMENT_PARSERS: readonly EmailParser[] = [
  statementParser('HDFC'),
  statementParser('ICICI'),
  statementParser('SBI_CARD', ANY_STATEMENT),
  statementParser('AXIS'),
  statementParser('KOTAK'),
  statementParser('FEDERAL', FEDERAL_STATEMENT),
];
