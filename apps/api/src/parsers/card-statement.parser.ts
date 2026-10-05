import type { ParsedEmail } from '../services/mailbox/providers/mail-provider';
import type { BankCode, CardStatementResult, EmailMeta, EmailParser } from './email-parser';
import {
  extractCardLast4,
  extractLast4,
  findPdfAttachment,
  headerRow,
  isMonthName,
  istDate,
  labelledAmount,
  labelledDate,
  MAX_PARSED_CHARS,
  MAX_SUBJECT_CHARS,
  parseIndianDate,
  parseInrAmount,
} from './fields';
import { beforePasswordInstructions, extractPasswordHint } from './password-hint';

/**
 * 'Payment Due Date: …', 'Due Date …', and ICICI's 'Payment due by …' / 'due on (or before) …'.
 * 'due by/on' needs 'Payment' in front: 'Total Amount Due on <date>' is an as-of date.
 */
const readDueDate = labelledDate(/due\s+date|payment\s+due\s+(?:by|on(?:\s+or\s+before)?)\b/);
const readStatementDate = labelledDate(/statement\s+date/);
const TOTAL_DUE_LABEL = /total\s+(?:amount|payment)\s+due/;
const MINIMUM_DUE_LABEL = /min(?:imum)?\.?\s+(?:amount|payment)\s+due/;
const readTotalDue = labelledAmount(TOTAL_DUE_LABEL);
const readMinimumDue = labelledAmount(MINIMUM_DUE_LABEL);
const summaryRow = headerRow([
  { label: TOTAL_DUE_LABEL, kind: 'amount' },
  { label: MINIMUM_DUE_LABEL, kind: 'amount' },
  { label: /(?:payment\s+)?due\s+date/, kind: 'date' },
]);

interface SummaryFigures {
  readonly totalDue: number | null;
  readonly minDue: number | null;
  readonly dueDate: string | null;
}

/** The same three figures when the summary is a table: labels in one row, values in the next. */
const readSummaryRow = (text: string): SummaryFigures | null => {
  const row = summaryRow(text);
  if (!row) return null;
  const [totalDue = '', minDue = '', dueDate = ''] = row;
  return {
    totalDue: parseInrAmount(totalDue),
    minDue: parseInrAmount(minDue),
    dueDate: parseIndianDate(dueDate),
  };
};
/**
 * End of the period a subject names: 'for the period ending (on) …' or 'for the period August 29,
 * 2026 to September 28, 2026'. Greedy, so the last 'to' wins ('pertaining to X to Y' → Y). Subject
 * only: the gaps are bounded, but bodies are long and untrusted.
 */
const readPeriodEnd = labelledDate(/\bperiod\b(?:\s{1,3}ending(?:\s{1,3}on)?|[^\n]{0,40}\bto)\b/);

/** The subject's words before 'credit card', where banks put the card's name. Bounded and lazy. */
const CARD_NAME_SOURCE = /^(.{1,80}?)\s+credit\s*card\b/i;
const MAX_CARD_NAME_WORDS = 3;
/** The width of credit_cards.card_name. */
const MAX_CARD_NAME_LENGTH = 60;
/** A card name is plain words: 'Pixel', 'Amazon', 'Times+'. Punctuation ends it ('Indresh,'). */
const NAME_WORD = /^[A-Za-z][A-Za-z&+]*$/;
/**
 * Words between a card's name and 'credit card' that are not part of it: the bank, the network,
 * adjectives ('Amazon Pay ICICI Bank', 'Pixel Play RuPay', 'Your Latest'). Skipped there.
 */
const SKIPPED_WORDS = new Set([
  'bank',
  'card',
  'rupay',
  'visa',
  'mastercard',
  'amex',
  'diners',
  'latest',
  'consolidated',
  'new',
  'monthly',
]);
/** Words that come before a card's name ('Your …', 'Statement for …', 'Hi …'): the name ends there. */
const STOP_WORDS = new Set(['your', 'the', 'for', 'of', 'statement', 'hi', 'hello', 'dear']);

const titleCase = (word: string): string =>
  word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

/**
 * The card's name from the subject ('Your HDFC Bank Pixel Play Credit Card Statement' → 'Pixel
 * Play'): the plain words right before 'credit card', after skipping the bank, network and
 * adjectives there, up to the first stop word, month or punctuation. A personal name before 'your'
 * ('Indresh your Kotak credit card statement') is never reached. Title-cased, so 'PIXEL Play' and
 * 'Pixel Play' are one card. `bankWords` name the issuing bank ('hdfc').
 */
export const extractCardName = (subject: string, bankWords: readonly string[]): string | null => {
  const prefix = CARD_NAME_SOURCE.exec(subject)?.[1] ?? '';
  const name: string[] = [];
  for (const word of prefix.split(/\s+/).reverse()) {
    const lower = word.toLowerCase();
    const skipped = SKIPPED_WORDS.has(lower) || bankWords.includes(lower);
    if (name.length === 0 && skipped) continue;
    const ends = skipped || STOP_WORDS.has(lower) || isMonthName(lower) || !NAME_WORD.test(word);
    if (ends || name.length === MAX_CARD_NAME_WORDS) break;
    name.unshift(titleCase(word));
  }
  return name.length > 0 ? name.join(' ').slice(0, MAX_CARD_NAME_LENGTH) : null;
};

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
  /** The bank's name in subjects ('hdfc'), left out of a card's name. */
  readonly bankWords: readonly string[];
  /**
   * Tells statement emails apart from the bank's other mail. Defaults to credit-card statements;
   * any override must still require the word "statement" (the search pre-filter).
   */
  readonly subject?: RegExp;
}

/**
 * Null unless the email names the card (its last 4 digits or its name in the subject) and gives the
 * total due and the due date. Only a statement with nothing due may lack the due date.
 */
const parseStatement = (
  { issuingBank, bankWords }: CardStatementParserConfig,
  email: ParsedEmail,
): CardStatementResult | null => {
  const subject = email.subject.slice(0, MAX_SUBJECT_CHARS);
  const body = email.text.slice(0, MAX_PARSED_CHARS);
  const text = `${subject}\n${body}`;
  // The subject names the card; in the body only a number next to 'card', before the password
  // instructions, is the card's.
  const last4 = extractLast4(subject) ?? extractCardLast4(beforePasswordInstructions(body));
  const cardName = extractCardName(subject, bankWords);
  // Labelled values first; a summary table's row of values only when a label has none after it.
  const labelledTotal = readTotalDue(text);
  const labelledDue = readDueDate(text);
  const labelledMin = readMinimumDue(text);
  const row =
    labelledTotal === null || labelledDue === null || labelledMin === null
      ? readSummaryRow(text)
      : null;
  const totalDue = labelledTotal ?? row?.totalDue ?? null;
  const dueDate = labelledDue ?? row?.dueDate ?? null;
  if (last4 === null && cardName === null) return null;
  if (totalDue === null || (dueDate === null && totalDue > 0)) return null;

  const minDue = labelledMin ?? row?.minDue ?? null;
  const passwordHint = extractPasswordHint(body);
  const pdf = findPdfAttachment(email.attachments);
  return {
    kind: 'CARD_STATEMENT',
    issuingBank,
    ...(last4 !== null ? { last4 } : {}),
    ...(cardName !== null ? { cardName } : {}),
    statementDate: readStatementDate(text) ?? readPeriodEnd(subject) ?? istDate(email.receivedAt),
    ...(dueDate !== null ? { dueDate } : {}),
    totalDue,
    ...(minDue !== null ? { minDue } : {}),
    ...(passwordHint !== null ? { passwordHint } : {}),
    ...(pdf ? { attachment: { locator: pdf.locator, filename: pdf.filename } } : {}),
  };
};

export const createCardStatementParser = (config: CardStatementParserConfig): EmailParser => {
  const subject = config.subject ?? CREDIT_CARD_STATEMENT;
  return {
    key: `${config.issuingBank.toLowerCase()}.cc-statement`,
    senders: config.senders,
    subjectKeywords: SUBJECT_KEYWORDS,
    matches: (meta: EmailMeta): boolean => subject.test(meta.subject.slice(0, MAX_SUBJECT_CHARS)),
    parse: (email: ParsedEmail): CardStatementResult | null => parseStatement(config, email),
  };
};
