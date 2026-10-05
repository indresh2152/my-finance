import type { ParsedEmail } from '../services/mailbox/providers/mail-provider';
import type { BankCode, CardStatementResult, EmailMeta, EmailParser } from './email-parser';
import {
  extractLast4,
  extractPasswordHint,
  findPdfAttachment,
  istDate,
  labelledAmount,
  labelledDate,
  MAX_PARSED_CHARS,
  MAX_SUBJECT_CHARS,
} from './fields';

const readTotalDue = labelledAmount(/total\s+(?:amount|payment)\s+due/);
const readMinimumDue = labelledAmount(/min(?:imum)?\.?\s+(?:amount|payment)\s+due/);
/**
 * 'Payment Due Date: …', 'Due Date …', and ICICI's 'Payment due by …' / 'due on (or before) …'.
 * 'due by/on' needs 'Payment' in front: 'Total Amount Due on <date>' is an as-of date.
 */
const readDueDate = labelledDate(/due\s+date|payment\s+due\s+(?:by|on(?:\s+or\s+before)?)\b/);
const readStatementDate = labelledDate(/statement\s+date/);
/**
 * End of the period a subject names: 'for the period ending (on) …' or 'for the period August 29,
 * 2026 to September 28, 2026'. Greedy, so the last 'to' wins ('pertaining to X to Y' → Y). Subject
 * only: the gaps are bounded, but bodies are long and untrusted.
 */
const readPeriodEnd = labelledDate(/\bperiod\b(?:\s{1,3}ending(?:\s{1,3}on)?|[^\n]{0,40}\bto)\b/);

/** Card statements only: excludes transaction alerts, offers and savings account statements. */
const CREDIT_CARD_STATEMENT = /credit\s*card.*statement|statement.*credit\s*card/i;
/**
 * Every statement subject contains one of these; the provider search filters on them. Gmail
 * matches whole words, so 'eStatement' needs its own entry.
 */
const SUBJECT_KEYWORDS = ['statement', 'estatement'];
export interface CardStatementParserConfig {
  readonly issuingBank: BankCode;
  readonly senders: readonly string[];
  /**
   * Tells statement emails apart from the bank's other mail. Defaults to credit-card statements;
   * any override must still require the word "statement" (the search pre-filter).
   */
  readonly subject?: RegExp;
}

/** Null unless the email gives the card's last 4 digits, the total due and the due date. */
const parseStatement = (issuingBank: BankCode, email: ParsedEmail): CardStatementResult | null => {
  const subject = email.subject.slice(0, MAX_SUBJECT_CHARS);
  const body = email.text.slice(0, MAX_PARSED_CHARS);
  const text = `${subject}\n${body}`;
  // The subject names the card; the body may also mask a mobile or account number.
  const last4 = extractLast4(subject) ?? extractLast4(body);
  const totalDue = readTotalDue(text);
  const dueDate = readDueDate(text);
  if (last4 === null || totalDue === null || dueDate === null) return null;

  const minDue = readMinimumDue(text);
  const passwordHint = extractPasswordHint(body);
  const pdf = findPdfAttachment(email.attachments);
  return {
    kind: 'CARD_STATEMENT',
    issuingBank,
    last4,
    statementDate: readStatementDate(text) ?? readPeriodEnd(subject) ?? istDate(email.receivedAt),
    dueDate,
    totalDue,
    ...(minDue !== null ? { minDue } : {}),
    ...(passwordHint !== null ? { passwordHint } : {}),
    ...(pdf ? { attachment: { locator: pdf.locator, filename: pdf.filename } } : {}),
  };
};

export const createCardStatementParser = ({
  issuingBank,
  senders,
  subject = CREDIT_CARD_STATEMENT,
}: CardStatementParserConfig): EmailParser => ({
  key: `${issuingBank.toLowerCase()}.cc-statement`,
  senders,
  subjectKeywords: SUBJECT_KEYWORDS,
  matches: (meta: EmailMeta): boolean => subject.test(meta.subject.slice(0, MAX_SUBJECT_CHARS)),
  parse: (email: ParsedEmail): CardStatementResult | null => parseStatement(issuingBank, email),
});
