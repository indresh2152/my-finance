import type { ParsedEmail } from '../services/mailbox/providers/mail-provider';
import type { AccountBalanceResult, BankCode, EmailMeta, EmailParser } from './email-parser';
import {
  extractAccount,
  extractAccountKind,
  istEndOfDay,
  labelledBalance,
  labelledDate,
  MAX_PARSED_CHARS,
  MAX_SUBJECT_CHARS,
} from './fields';

/** 'Avl Bal', 'Avbl. Bal', 'Available Balance', 'Closing Balance', 'Account balance'. */
const readLabelledBalance = labelledBalance(
  /\b(?:av(?:ai)?b?l(?:able)?\.?|closing|clear|ledger)\s*bal(?:ance)?\b\.?|\baccount\s+balance\b/,
);
/** 'Available balance in A/c XX1234 as on 29-09-2026 is Rs. 5,000': the gap is bounded and lazy. */
const readBalanceSentence = labelledBalance(
  /\b(?:available|avl|closing|account)\s+balance\b[^\n]{0,80}?\bis\b/,
);
const readAsOfDate = labelledDate(/\bas\s+(?:on|of|at)\b/);
/** The closing date of a statement period ('for the period 01-08-2026 to 31-08-2026'). */
const readPeriodEnd = labelledDate(/\bperiod\b[^\n]{0,40}?\bto\b/);

/** Balance alerts and account statements. */
const BALANCE_SUBJECT =
  /\bbalance\b|\b(?:account|a\/c|savings|current)\b.*statement|statement.*\b(?:account|a\/c)\b/i;
/**
 * The same banks also send card, loan, PPF, demat and investment statements; a loan's outstanding
 * amount must never show up as money in a bank account. Card mail belongs to the card parsers.
 */
const NOT_A_BANK_ACCOUNT =
  /credit\s*card|\bloans?\b|\bppf\b|\bdemat\b|\bmutual\s+funds?\b|\binsurance\b|\btrading\b|\bnps\b/i;
/**
 * Every balance subject contains one of these; the provider search filters on them. Gmail matches
 * whole words, so 'eStatement' needs its own entry.
 */
const SUBJECT_KEYWORDS = ['balance', 'statement', 'estatement'];

export interface AccountBalanceParserConfig {
  readonly bankName: BankCode;
  readonly senders: readonly string[];
}

/**
 * A date stated in the body counts from the end of that day (IST), but never later than the email
 * itself: a statement's closing balance must not outrank a later alert just because it arrived later.
 */
const balanceAsOf = (text: string, receivedAt: Date): Date => {
  const stated = readAsOfDate(text) ?? readPeriodEnd(text);
  if (stated === null) return receivedAt;
  const endOfDay = istEndOfDay(stated);
  return endOfDay < receivedAt ? endOfDay : receivedAt;
};

/** Null unless the email gives the account's last 4 digits and a balance. */
const parseBalance = (bankName: BankCode, email: ParsedEmail): AccountBalanceResult | null => {
  const text = `${email.subject}\n${email.text.slice(0, MAX_PARSED_CHARS)}`;
  const account = extractAccount(text);
  const balance = readLabelledBalance(text) ?? readBalanceSentence(text);
  if (account === null || balance === null) return null;

  // Only a type named next to the account (or in the subject): the first type saved is kept, and
  // body text such as 'Open a Savings Account today!' must not decide it.
  const accountType = account.kind ?? extractAccountKind(email.subject);
  return {
    kind: 'ACCOUNT_BALANCE',
    bankName,
    last4: account.last4,
    balance,
    asOf: balanceAsOf(text, email.receivedAt).toISOString(),
    ...(accountType ? { accountType } : {}),
  };
};

export const createAccountBalanceParser = ({
  bankName,
  senders,
}: AccountBalanceParserConfig): EmailParser => ({
  key: `${bankName.toLowerCase()}.balance`,
  senders,
  subjectKeywords: SUBJECT_KEYWORDS,
  matches: (meta: EmailMeta): boolean => {
    const subject = meta.subject.slice(0, MAX_SUBJECT_CHARS);
    return BALANCE_SUBJECT.test(subject) && !NOT_A_BANK_ACCOUNT.test(subject);
  },
  parse: (email: ParsedEmail): AccountBalanceResult | null => parseBalance(bankName, email),
});
