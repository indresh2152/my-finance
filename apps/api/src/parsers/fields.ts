import type { EmailAttachment } from '../services/mailbox/providers/mail-provider';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const TWO_DIGIT_YEAR_BASE = 2000;
const IST_OFFSET_MS = 330 * 60 * 1000;
const ISO_DATE_LENGTH = 10;
const MAX_HINT_LENGTH = 300;
const MAX_HINT_SENTENCES = 3;
const PDF_MIME_TYPE = 'application/pdf';

/** Currency prefix optional; a Cr suffix marks a credit balance. */
const AMOUNT_VALUE = String.raw`(?:Rs\.?|INR|₹)?\s*\d[\d,]*(?:\.\d{1,2})?(?:\s*(?:Cr|Dr)\b)?`;
const DATE_VALUE = String.raw`\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}[\s-][A-Za-z]{3,9}[\s,-]+\d{2,4}|[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}`;
/**
 * Between a label and its value: spaces, newlines, ':', '-', '–', optionally 'is' / 'of'.
 * Bounded and unambiguous, so untrusted email text cannot trigger catastrophic backtracking.
 */
const LABEL_SEPARATOR = String.raw`[\s:\-–]{0,40}(?:\((?:Rs\.?|INR|₹)\)[\s:\-–]{0,40})?(?:(?:is|of)[\s:\-–]{1,40})?`;

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
  label: RegExp,
  value: string,
  parse: (raw: string) => T | null,
): FieldReader<T> => {
  const pattern = new RegExp(`${label.source}${LABEL_SEPARATOR}(${value})`, 'i');
  return (text) => {
    const raw = pattern.exec(text)?.[1];
    return raw === undefined ? null : parse(raw);
  };
};

export const labelledAmount = (label: RegExp): FieldReader<number> =>
  labelledValue(label, AMOUNT_VALUE, parseInrAmount);

export const labelledDate = (label: RegExp): FieldReader<string> =>
  labelledValue(label, DATE_VALUE, parseIndianDate);

/**
 * 'ending (with) 1234' first, as it names the card explicitly; then the first masked number
 * ('XXXX XXXX XXXX 1234', 'XX1234', '**** 1234'), which may also be a masked mobile or account.
 */
export const extractLast4 = (text: string): string | null =>
  ENDING_NUMBER.exec(text)?.[1] ?? MASKED_NUMBER.exec(text)?.[1] ?? null;

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

/** Calendar date (YYYY-MM-DD) of an instant in India Standard Time. */
export const istDate = (instant: Date): string =>
  new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(0, ISO_DATE_LENGTH);
