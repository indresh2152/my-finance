import type { ParsedEmail } from '../services/mailbox/providers/mail-provider';
import type { BankCode, CardStatementResult, EmailMeta, EmailParser } from './email-parser';
import {
  extractLast4,
  extractPasswordHint,
  findPdfAttachment,
  istDate,
  labelledAmount,
  labelledDate,
} from './fields';

const readTotalDue = labelledAmount(/total\s+(?:amount|payment)\s+due/);
const readMinimumDue = labelledAmount(/min(?:imum)?\.?\s+(?:amount|payment)\s+due/);
const readDueDate = labelledDate(/(?:payment\s+)?due\s+date/);
const readStatementDate = labelledDate(/statement\s+date/);

/** Statement figures sit near the top; the cap bounds regex work on very long (or hostile) bodies. */
const MAX_PARSED_CHARS = 20_000;
/** Real subjects are short; the cap keeps the subject pattern's `.*` cheap on hostile ones. */
const MAX_SUBJECT_CHARS = 500;

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
  const body = email.text.slice(0, MAX_PARSED_CHARS);
  const text = `${email.subject}\n${body}`;
  // The subject names the card; the body may also mask a mobile or account number.
  const last4 = extractLast4(email.subject) ?? extractLast4(body);
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
    statementDate: readStatementDate(text) ?? istDate(email.receivedAt),
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
