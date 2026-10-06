import type { EmailAttachment } from '../services/mailbox/providers/mail-provider';

const MONTH_NAMES = [
  ...['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august'],
  ...['september', 'october', 'november', 'december'],
];
const MONTHS = MONTH_NAMES.map((name) => name.slice(0, 3));
/** 'Sep', 'sept' and 'September', in any case. */
export const isMonthName = (word: string): boolean => {
  const lower = word.toLowerCase();
  return MONTH_NAMES.includes(lower) || MONTHS.includes(lower) || lower === 'sept';
};
const TWO_DIGIT_YEAR_BASE = 2000;
const IST_OFFSET_MS = 330 * 60 * 1000;
const ISO_DATE_LENGTH = 10;
const PDF_MIME_TYPE = 'application/pdf';
/** Figures sit near the top; the cap bounds regex work on very long (or hostile) bodies. */
export const MAX_PARSED_CHARS = 20_000;
/** Real subjects are short; the cap keeps subject patterns' `.*` cheap on hostile ones. */
export const MAX_SUBJECT_CHARS = 500;

/**
 * Currency prefix optional; a Cr suffix marks a credit balance. The number must not run on into a
 * date ('31-08-2026') or more digits, so a date after a label is never read as an amount; the
 * Indian '/-' suffix ('Rs. 12,345.00/-') is not a date.
 */
const AMOUNT_VALUE = String.raw`(?:Rs\.?|INR|₹)?[ \t]*\d[\d,]*(?:\.\d{1,2})?(?![\d-]|/(?!-)|\.\d)(?:[ \t]*(?:Cr|Dr)\b)?`;
const DATE_VALUE = String.raw`\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}[\s-][A-Za-z]{3,9}[\s,-]+\d{2,4}|[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}`;
/**
 * Between a label and its value: whitespace, ':', '-', '–', optionally 'is' / 'of'.
 * Bounded and unambiguous, so untrusted email text cannot trigger catastrophic backtracking.
 */
const LABEL_GAP = String.raw`[\s:\-–]`;
const LABEL_SEPARATOR = String.raw`${LABEL_GAP}{0,40}(?:\((?:Rs\.?|INR|₹)\)${LABEL_GAP}{0,40})?(?:(?:is|of)${LABEL_GAP}{1,40})?`;

const AMOUNT_PARTS = /^(?:Rs\.?|INR|₹)?\s*(\d[\d,]*(?:\.\d{1,2})?)(?:\s*(Cr|Dr)\b)?/i;
const NUMERIC_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/;
const DAY_MONTH_YEAR = /^(\d{1,2})[\s-]([A-Za-z]{3,9})[\s,-]+(\d{2}|\d{4})$/;
const MONTH_DAY_YEAR = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/;

/**
 * Bounded mask groups with a required separator between them: linear on any input, so a long run
 * of X's in untrusted email text cannot stall the sync.
 */
const MASKED_NUMBER = /[Xx*•]{2,12}(?:[\s-]{1,3}[Xx*•]{2,12}){0,4}[\s-]{0,3}(\d{4})(?!\d)/;
/** A single X before the digits ('Zen Credit Card X0958'), not inside a word. */
const SINGLE_MASK_NUMBER = /(?<![A-Za-z\d])[Xx](\d{4})(?!\d)/;
/** Every 'card' in a statement body; its masked number follows within CARD_CONTEXT_LENGTH. */
const CARD_WORD = /\bcard\b/gi;
const CARD_CONTEXT_LENGTH = 44;
const ENDING_NUMBER = /\bending(?:\s+(?:with|in))?[\s:-]*(\d{4})(?!\d)/i;

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
  label: string,
  value: string,
  parse: (raw: string) => T | null,
): FieldReader<T> => {
  const pattern = new RegExp(`(?:${label})${LABEL_SEPARATOR}(${value})`, 'i');
  return (text) => {
    const match = pattern.exec(text);
    return match ? parse(match[1] ?? '') : null;
  };
};

export const labelledAmount = (label: RegExp): FieldReader<number> =>
  labelledValue(label.source, AMOUNT_VALUE, parseInrAmount);

/** Up to this many characters after a header label are searched for the value row. */
const HEADER_ROW_WINDOW = 400;
/** Header candidates tried per text, so a body full of the label cannot multiply the work. */
const MAX_HEADER_ATTEMPTS = 5;
/** Between header labels: units and line breaks ('\nINR ', '\n(INR) '), never a digit. */
const HEADER_GAP = String.raw`[^\d]{0,80}?`;

/**
 * Builds a reader for labels laid out as table headers with their values together on a row below
 * (Axis: 'Total Amount Due INR Minimum Amount Due (INR) Payment Due Date (DD-MM-YYYY)\n488 Dr 100
 * Dr 03/10/2026'). Returns the raw values in column order. Searches only a window after each of the
 * first few header labels, so the bounded gaps cannot add up on a long body.
 */
export const headerRow = (
  columns: ReadonlyArray<{ readonly label: RegExp; readonly kind: 'amount' | 'date' }>,
): FieldReader<string[]> => {
  const [first] = columns;
  if (!first) throw new Error('headerRow needs a column');
  const start = new RegExp(first.label.source, 'gi');
  const header = columns.map(({ label }) => `(?:${label.source})`).join(HEADER_GAP);
  const values = columns
    .map(({ kind }) => `(${kind === 'amount' ? AMOUNT_VALUE : `(?:${DATE_VALUE})`})`)
    .join(String.raw`\s+`);
  const pattern = new RegExp(String.raw`^${header}[^\d]{0,40}?${values}`, 'i');
  return (text) => {
    let attempts = 0;
    // Every header candidate, not just the first: prose ('your total amount due is …') may come first.
    for (const { index } of text.matchAll(start)) {
      const match = pattern.exec(text.slice(index, index + HEADER_ROW_WINDOW));
      if (match) return columns.map((_column, column) => match[column + 1] ?? '');
      if (++attempts === MAX_HEADER_ATTEMPTS) break;
    }
    return null;
  };
};

export const labelledDate = (label: RegExp): FieldReader<string> =>
  labelledValue(label.source, DATE_VALUE, parseIndianDate);

/**
 * 'ending (with) 1234' first, as it names the card explicitly; then the first masked number
 * ('XXXX XXXX XXXX 1234', 'XX1234', '**** 1234'), which may also be a masked mobile or account.
 */
export const extractLast4 = (text: string): string | null =>
  ENDING_NUMBER.exec(text)?.[1] ??
  MASKED_NUMBER.exec(text)?.[1] ??
  SINGLE_MASK_NUMBER.exec(text)?.[1] ??
  null;

/**
 * The card's last 4 digits in a statement body: only right after the word 'card', so a masked
 * mobile number, phone extension or reward count elsewhere is never taken for the card.
 */
export const extractCardLast4 = (text: string): string | null => {
  // Overlapping windows: in 'Credit Card Statement for Card No. XXXX 1234' the first 'card' must
  // not swallow the second one's number.
  for (const { index } of text.matchAll(CARD_WORD)) {
    const last4 = extractLast4(text.slice(index, index + CARD_CONTEXT_LENGTH));
    if (last4 !== null) return last4;
  }
  return null;
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
