/**
 * Reads the bank's description of the statement password format from an email body, for any bank
 * and wording. Never keeps a value: the hint is stored and shown, so it must describe the format,
 * not hold a date, ID or password.
 */
const MAX_HINT_LENGTH = 400;
/** How many sentences past the first hint sentence to look; bounds the scan of an example block. */
const HINT_WINDOW = 12;
/**
 * After . ! or ?, except after e.g. and i.e., which banks use inside hints, and titles ('Dear Mr.
 * Indresh …'), so a greeting stays in its sentence and is cut off with it.
 */
const SENTENCE_BREAK = /(?<=[.!?])(?<!\b(?:e\.g|i\.e|mr|mrs|ms|dr)\.)\s+|\n+/i;
const PASSWORD_WORD = /password/i;
/** Names the statement itself; 'open'/'access'/'view' alone also fit promos ('Open an FD …'). */
const STATEMENT_WORD = /statement|attach|pdf|protected/i;
const OPEN_VERB = /\b(?:open|access|view)/i;
const COUNT = String.raw`(?:\d{1,2}|two|three|four|five|six|eight)`;
/**
 * Formats that describe nothing but a password, so they open a hint even in a sentence that names
 * neither the statement nor a password (Kotak: 'Enter the first 4 letters of your name … in DDMM
 * format'). 'last N digits' is left out: payment instructions use it too ('<last 4 digits>@icici').
 */
const PASSWORD_ONLY_FORMAT = new RegExp(
  String.raw`\bdd[\s/.-]?mm|\bletters\s+of\s+(?:your|the)\b|\b(?:first|last)\s+${COUNT}\s+(?:letters|characters)\b`,
  'i',
);
/** Every password format: the password-only ones, plus parts other text mentions too. */
const FORMAT_RULE = new RegExp(
  String.raw`${PASSWORD_ONLY_FORMAT.source}|\bdate\s+of\s+birth\b|\bdob\b|\b(?:year\s+of\s+birth|birth\s+year)\b|\b(?:first|last)\s+${COUNT}\s+digits\b`,
  'i',
);
/** Identifiers a password can be built from, but that promos and footers mention too. */
const IDENTITY =
  /\bpan\b|\bcrn\b|\bcustomer\s+id\b|\b(?:registered\s+)?mobile\s+number\b|\byour\s+(?:full\s+)?name\b/i;
const CASE_RULE =
  /\b(?:lower|upper)\s?case\b|\bcapitals\b|\bcapital\s+letters\b|\bcase[\s-]sensitive\b/i;
/** A security warning; cut off like an example ('…DDMM format; do not share it'). */
const SECURITY_WARNING = /\b(?:never|do\s+not|don['’]t)\s+(?:share|disclose|reveal)\b/i;
/** Log-in help mentions a password too; it is off topic unless it also names a format. */
const LOGIN_HELP = /\bforgot\b|\breset\b|\blog\s?in\b|\bnet\s?banking\b/i;
/** Starts a worked example: the clause and the lines after it hold a sample name, DOB or password. */
const EXAMPLE_START =
  /\b(?:for\s+example|example|e\.g\.|eg\b|i\.e\.|such\s+as|for\s+instance|illustration|sample)/i;
/** Numbering before a rule ('Option 1:', 'Step 2 -', '3.'): not a value, though it has a digit. */
const LIST_NUMBER = /^\s*(?:(?:option|step)\s*)?\d{1,2}\s*[:.)-]\s+/i;
/**
 * A greeting before the rule on the same line, i.e. the user's name: 'Dear Mr. Indresh Singh
 * Rathore,' / 'Hi Indresh:' / a bare 'Indresh Singh Rathore,' (capitalised words, then a comma).
 */
const GREETING =
  /^\s*(?:(?:[Dd]ear|DEAR|[Hh]i|HI|[Hh]ello|HELLO)\b[^,:\n]{0,80}[,:]|[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3},)\s*/;
/** Where a body's password instructions begin: a password or a worked example. */
const INSTRUCTIONS = new RegExp(`${PASSWORD_WORD.source}|${EXAMPLE_START.source}`, 'i');

/**
 * The body before its password instructions, where the statement's own figures and card number
 * are: digits in a worked example ('If your card number is XXXX 5648 …') are not the user's.
 */
export const beforePasswordInstructions = (text: string): string => {
  const start = text.search(INSTRUCTIONS);
  return start === -1 ? text : text.slice(0, start);
};

/** From an example or a warning to the end of the sentence: neither is part of the rule. */
const ASIDE_CLAUSE = new RegExp(
  `(?:${EXAMPLE_START.source}|${SECURITY_WARNING.source})[\\s\\S]*$`,
  'i',
);
/** Counts in a rule ('first 4 letters', 'last 4 digits', '10-digit'): the only digits a hint has. */
const COUNT_PHRASE = /\b\d{1,2}[\s-]+(?:digit|letter|character|alphabet)s?\b/gi;
/**
 * Any other digit is a value: a date, year, ID or sample password ('05 01', '05Jan', '92',
 * 'RAHU 05 01', 'sgup0501'), in any script. Hints describe the format, so such a line is never kept.
 */
const holdsValue = (rule: string): boolean => /\p{Nd}/u.test(rule.replace(COUNT_PHRASE, ''));
/** Shorter lines are headings ('Date of Birth') or example values ('Raj Bhargava'), never a rule. */
const MIN_RULE_WORDS = 4;
/** Left at the end once an example clause is cut off ('…and DDMM, e.g. X' → '…and DDMM'). */
const DANGLING_PUNCTUATION = new Set([' ', ',', ';', ':', '(', '–', '-']);

/**
 * The sentence without a greeting, list numbering ('Option 1:'), or any worked-example or warning
 * clause, whitespace collapsed. Trailing punctuation is trimmed in a loop: an anchored regex would
 * backtrack quadratically on a long run of it.
 */
const ruleText = (sentence: string): string => {
  const rule = sentence
    .replace(GREETING, '')
    .replace(LIST_NUMBER, '')
    .replace(ASIDE_CLAUSE, '')
    .replace(/\s+/g, ' ')
    .trim();
  let end = rule.length;
  while (end > 0 && DANGLING_PUNCTUATION.has(rule.charAt(end - 1))) end -= 1;
  return rule.slice(0, end);
};

/** Long enough to state a rule, and free of values and log-in help. */
const isCleanRule = (rule: string): boolean =>
  rule.split(' ', MIN_RULE_WORDS).length === MIN_RULE_WORDS &&
  !holdsValue(rule) &&
  (!LOGIN_HELP.test(rule) || FORMAT_RULE.test(rule) || IDENTITY.test(rule));

/** Says 'password' or names a format that only passwords use. */
const describesPassword = (rule: string): boolean =>
  PASSWORD_WORD.test(rule) || FORMAT_RULE.test(rule);

/**
 * Opens the hint: a password or format in a sentence naming the statement, a password-only format
 * anywhere, or a sentence right after a statement sentence that says 'password' or 'open' ('Your
 * statement is attached. To open it, use your PAN.').
 */
const opensHint = (rule: string, previous: string): boolean => {
  const opens = OPEN_VERB.test(rule);
  // An identifier alone is a promo ('Update your PAN to keep receiving your statement').
  if (!(describesPassword(rule) || (IDENTITY.test(rule) && opens)) || !isCleanRule(rule)) {
    return false;
  }
  if (STATEMENT_WORD.test(rule) || PASSWORD_ONLY_FORMAT.test(rule)) return true;
  return STATEMENT_WORD.test(previous) && (PASSWORD_WORD.test(rule) || opens);
};

/**
 * A further rule: an identifier alone ('Link your PAN with Aadhaar') is not one. Inside a worked
 * example only a password-only format or a case rule is, so a sample row ('C.K. Ajay Kumar + Date
 * of Birth') stays out.
 */
const continuesHint = (rule: string, clean: boolean, inExample: boolean): boolean =>
  clean &&
  (CASE_RULE.test(rule) || (inExample ? PASSWORD_ONLY_FORMAT.test(rule) : describesPassword(rule)));

/**
 * The bank's description of the statement password format, whatever the wording: the first
 * sentence that ties a password, or a format such as 'DDMM' or 'first 4 letters of your name', to
 * the statement, plus the rule sentences that follow it, up to the first unrelated sentence.
 * Worked examples (their clause, and the lines after them up to the next rule) are skipped, and no
 * line with a digit-bearing value (date, ID, PAN, sample password) is ever kept. A letters-only
 * sample inside an example ('S Gupta', 'rahu') can still slip through; it is the bank's own text,
 * sent to every customer.
 */
export const extractPasswordHint = (text: string): string | null => {
  const sentences = text.split(SENTENCE_BREAK);
  const rules = sentences.map(ruleText);
  const start = rules.findIndex((rule, index) => opensHint(rule, sentences[index - 1] ?? ''));
  if (start === -1) return null;

  const hint = [rules[start]];
  let inExample = EXAMPLE_START.test(sentences[start] ?? '');
  for (let index = start + 1; index <= start + HINT_WINDOW && index < rules.length; index += 1) {
    const rule = rules[index] ?? '';
    const clean = isCleanRule(rule);
    const startsExample = EXAMPLE_START.test(sentences[index] ?? '');
    if (continuesHint(rule, clean, inExample)) {
      hint.push(rule);
      inExample = startsExample;
    } else if (startsExample) {
      inExample = true;
    } else if (!inExample && clean) {
      break; // an unrelated sentence: the hint is over
    }
    // Otherwise an example row, a heading or a value line: skip it.
  }
  return hint.join(' ').slice(0, MAX_HINT_LENGTH);
};
