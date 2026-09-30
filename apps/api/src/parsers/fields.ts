import type { EmailAttachment } from '../services/mailbox/providers/mail-provider';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const TWO_DIGIT_YEAR_BASE = 2000;
const IST_OFFSET_MS = 330 * 60 * 1000;
const ISO_DATE_LENGTH = 10;
const MAX_HINT_LENGTH = 300;
const MAX_HINT_SENTENCES = 3;
const PDF_MIME_TYPE = 'application/pdf';
/** Figures sit near the top; the cap bounds regex work on very long (or hostile) bodies. */
export const MAX_PARSED_CHARS = 20_000;
/** Real subjects are short; the cap keeps subject patterns' `.*` cheap on hostile ones. */
export const MAX_SUBJECT_CHARS = 500;

/**
 * Currency prefix optional; a Cr suffix marks a credit balance. The number must not run on into a
 * date ('31-08-2026') or more digits, so a date after a label is never read as an amount.
 */
const AMOUNT_VALUE = String.raw`(?:Rs\.?|INR|₹)?[ \t]*\d[\d,]*(?:\.\d{1,2})?(?![\d/-]|\.\d)(?:[ \t]*(?:Cr|Dr)\b)?`;
const DATE_VALUE = String.raw`\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}[\s-][A-Za-z]{3,9}[\s,-]+\d{2,4}|[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}`;
/**
 * Between a label and its value: `space` characters, ':', '-', '–', optionally 'is' / 'of'.
 * Bounded and unambiguous, so untrusted email text cannot trigger catastrophic backtracking.
 */
const labelSeparator = (space: string): string => {
  const gap = String.raw`[${space}:\-–]`;
  return String.raw`${gap}{0,40}(?:\((?:Rs\.?|INR|₹)\)${gap}{0,40})?(?:(?:is|of)${gap}{1,40})?`;
};
const LABEL_SEPARATOR = labelSeparator(String.raw`\s`);
/**
 * Without newlines: a statement summary lays labels out as table headers, and the next line's
 * first figure belongs to another column.
 */
const SAME_LINE_SEPARATOR = labelSeparator(String.raw` \t`);
/** Skips an 'as on 29-09-2026' between a balance label and its amount. */
const STATED_DATE = String.raw`(?:[ \t:\-–]{0,10}(?:as[ \t]+(?:on|of|at)\b)?[ \t:\-–]{0,10}(?:${DATE_VALUE}))?`;

const AMOUNT_PARTS = /^(?:Rs\.?|INR|₹)?\s*(\d[\d,]*(?:\.\d{1,2})?)(?:\s*(Cr|Dr)\b)?/i;
const NUMERIC_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/;
const DAY_MONTH_YEAR = /^(\d{1,2})[\s-]([A-Za-z]{3,9})[\s,-]+(\d{2}|\d{4})$/;
const MONTH_DAY_YEAR = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/;

/**
 * Bounded mask groups with a required separator between them: linear on any input, so a long run
 * of X's in untrusted email text cannot stall the sync.
 */
const MASKED_NUMBER = /[Xx*•]{2,12}(?:[\s-]{1,3}[Xx*•]{2,12}){0,4}[\s-]{0,3}(\d{4})(?!\d)/;
const ENDING_NUMBER = /\bending(?:\s+(?:with|in))?[\s:-]*(\d{4})(?!\d)/i;
/**
 * A masked account number right after 'A/c', 'Acct' or 'Account' ('A/c no. XX1234', 'Account
 * ending 1234', 'a/c **1234'), with the 'Savings' / 'Current' word directly before it, if any.
 * Without 'ending' a mask character is required, so an amount or year after 'account' is not
 * taken. Every repeat is bounded, so untrusted text cannot stall the sync.
 */
const KIND_WORD = String.raw`\b(savings?|current)[ \t]+(?:bank[ \t]+)?`;
const ACCOUNT_WORD = String.raw`\b(?:a\/c|acct|account)\b`;
const ACCOUNT_NUMBER = new RegExp(
  String.raw`(?:${KIND_WORD})?${ACCOUNT_WORD}(?:\s{0,3}(?:no|number)\b\.?)?[\s:.-]{0,5}(?:ending(?:\s+(?:with|in))?[\s:-]{0,5}[Xx*•\s-]{0,24}|[Xx*•][Xx*•\s-]{0,23})(\d{4})(?!\d)`,
  'i',
);
/** 'Savings Account', 'Current A/c': the account kind named in a subject. */
const ACCOUNT_KIND = new RegExp(`${KIND_WORD}${ACCOUNT_WORD}`, 'i');
const DEBIT_SUFFIX = /\bDr\b/i;
/** A minus set apart from the label ('Avl Bal: -5,000'), unlike the dash in 'Bal:-5,000'. */
const LEADING_MINUS = /[ \t]-$/;

/** After . ! or ?, except the abbreviations e.g. and i.e., which banks use inside hints. */
const SENTENCE_BREAK = /(?<=[.!?])(?<!\b(?:e\.g|i\.e)\.)\s+|\n+/i;
const PASSWORD_WORD = /password/i;
const STATEMENT_CONTEXT = /open|attach|statement|pdf|protected/i;

export const parseInrAmount = (raw: string): number | null => {
  const match = AMOUNT_PARTS.exec(raw.trim());
  const digits = match?.[1];
  if (digits === undefined) return null;
  const value = Number(digits.replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  const isCredit = match?.[2]?.toLowerCase() === 'cr';
  return isCredit && value !== 0 ? -value : value;
};

/**
 * Bank balances read the other way round from card dues: no suffix or Cr is money in the account;
 * a Dr suffix or a leading minus (the end of `separator`, the text before the amount) means it is
 * overdrawn.
 */
export const parseBalanceAmount = (raw: string, separator = ''): number | null => {
  const value = parseInrAmount(raw);
  if (value === null) return null;
  const magnitude = Math.abs(value);
  const overdrawn = DEBIT_SUFFIX.test(raw) || LEADING_MINUS.test(separator);
  return overdrawn && magnitude !== 0 ? -magnitude : magnitude;
};

const monthNumber = (name: string): number | null => {
  const index = MONTHS.indexOf(name.slice(0, 3).toLowerCase());
  return index === -1 ? null : index + 1;
};

/** Returns YYYY-MM-DD, or null for an impossible date such as 31 Feb. */
const toIsoDate = (year: number, month: number, day: number): string | null => {
  const fullYear = year < 100 ? TWO_DIGIT_YEAR_BASE + year : year;
  const date = new Date(Date.UTC(fullYear, month - 1, day));
  const valid =
    date.getUTCFullYear() === fullYear &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  return valid ? date.toISOString().slice(0, ISO_DATE_LENGTH) : null;
};

const namedMonthDate = (
  day: string | undefined,
  monthName: string | undefined,
  year: string | undefined,
): string | null => {
  const month = monthNumber(monthName ?? '');
  return month ? toIsoDate(Number(year), month, Number(day)) : null;
};

/** Day-first numeric dates (Indian convention), '05 Sep 2026' and 'September 25, 2026'. */
export const parseIndianDate = (raw: string): string | null => {
  const text = raw.trim();
  const numeric = NUMERIC_DATE.exec(text);
  if (numeric) return toIsoDate(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));

  const dayFirst = DAY_MONTH_YEAR.exec(text);
  if (dayFirst) return namedMonthDate(dayFirst[1], dayFirst[2], dayFirst[3]);
  const monthFirst = MONTH_DAY_YEAR.exec(text);
  if (monthFirst) return namedMonthDate(monthFirst[2], monthFirst[1], monthFirst[3]);
  return null;
};

export type FieldReader<T> = (text: string) => T | null;

/**
 * Builds a reader for the value right after a label (the first place the label is directly
 * followed by a value of that shape). Compiled once, so call it at module scope.
 */
const labelledValue = <T>(
  label: string,
  value: string,
  parse: (raw: string, separator: string) => T | null,
  separator = LABEL_SEPARATOR,
): FieldReader<T> => {
  const pattern = new RegExp(`(?:${label})(${separator})(${value})`, 'i');
  return (text) => {
    const match = pattern.exec(text);
    return match ? parse(match[2] ?? '', match[1] ?? '') : null;
  };
};

export const labelledAmount = (label: RegExp): FieldReader<number> =>
  labelledValue(label.source, AMOUNT_VALUE, parseInrAmount);

/** The amount on the label's own line, optionally after the date it is stated for. */
export const labelledBalance = (label: RegExp): FieldReader<number> =>
  labelledValue(
    `(?:${label.source})${STATED_DATE}`,
    AMOUNT_VALUE,
    parseBalanceAmount,
    SAME_LINE_SEPARATOR,
  );

export const labelledDate = (label: RegExp): FieldReader<string> =>
  labelledValue(label.source, DATE_VALUE, parseIndianDate);

/**
 * 'ending (with) 1234' first, as it names the card explicitly; then the first masked number
 * ('XXXX XXXX XXXX 1234', 'XX1234', '**** 1234'), which may also be a masked mobile or account.
 */
export const extractLast4 = (text: string): string | null =>
  ENDING_NUMBER.exec(text)?.[1] ?? MASKED_NUMBER.exec(text)?.[1] ?? null;

export type AccountKind = 'SAVINGS' | 'CURRENT';

const kindOf = (word: string | undefined): AccountKind | undefined => {
  if (word === undefined) return undefined;
  return word.toLowerCase().startsWith('saving') ? 'SAVINGS' : 'CURRENT';
};

export interface AccountMention {
  readonly last4: string;
  /** Only when 'Savings' / 'Current' directly precedes the account number. */
  readonly kind?: AccountKind;
}

/**
 * The first masked bank account number. Anchored on the account label, because alert bodies often
 * mask a mobile or card number too.
 */
export const extractAccount = (text: string): AccountMention | null => {
  const match = ACCOUNT_NUMBER.exec(text);
  const last4 = match?.[2];
  if (!match || last4 === undefined) return null;
  const kind = kindOf(match[1]);
  return kind ? { last4, kind } : { last4 };
};

/** 'Savings' or 'Current' when the text names a savings or current account. */
export const extractAccountKind = (text: string): AccountKind | undefined =>
  kindOf(ACCOUNT_KIND.exec(text)?.[1]);

/**
 * The bank's description of the statement password format: the first sentence that mentions a
 * password in the context of opening the statement, plus directly following password sentences.
 * Banks describe the format, never the password itself.
 */
export const extractPasswordHint = (text: string): string | null => {
  const sentences = text.split(SENTENCE_BREAK);
  const start = sentences.findIndex(
    (sentence) => PASSWORD_WORD.test(sentence) && STATEMENT_CONTEXT.test(sentence),
  );
  if (start === -1) return null;

  const hint: string[] = [];
  for (const sentence of sentences.slice(start, start + MAX_HINT_SENTENCES)) {
    if (!PASSWORD_WORD.test(sentence)) break;
    hint.push(sentence.replace(/\s+/g, ' ').trim());
  }
  return hint.join(' ').slice(0, MAX_HINT_LENGTH);
};

export const findPdfAttachment = (
  attachments: readonly EmailAttachment[],
): EmailAttachment | null =>
  attachments.find(
    (attachment) =>
      attachment.mimeType.toLowerCase() === PDF_MIME_TYPE || /\.pdf$/i.test(attachment.filename),
  ) ?? null;

/** The last instant of a calendar day (YYYY-MM-DD) in India Standard Time. */
export const istEndOfDay = (isoDate: string): Date =>
  new Date(Date.parse(`${isoDate}T23:59:59.999Z`) - IST_OFFSET_MS);

/** Calendar date (YYYY-MM-DD) of an instant in India Standard Time. */
export const istDate = (instant: Date): string =>
  new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(0, ISO_DATE_LENGTH);
