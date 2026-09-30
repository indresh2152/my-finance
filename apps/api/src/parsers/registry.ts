import { matchesSender } from './sender-match';
import type { EmailMeta, EmailParser } from './email-parser';
import { CARD_STATEMENT_PARSERS } from './banks/card-statements';
import { ACCOUNT_BALANCE_PARSERS } from './banks/account-balances';

/**
 * Card statements first: find() returns the first match, and the balance parsers must never claim
 * a card email.
 */
export const BANK_PARSERS: readonly EmailParser[] = [
  ...CARD_STATEMENT_PARSERS,
  ...ACCOUNT_BALANCE_PARSERS,
];

export class ParserRegistry {
  constructor(private readonly parsers: readonly EmailParser[]) {
    const keys = new Set<string>();
    for (const parser of parsers) {
      if (keys.has(parser.key)) {
        throw new Error(`Duplicate parser key: ${parser.key}`);
      }
      keys.add(parser.key);
    }
  }

  allSenders(): string[] {
    return [
      ...new Set(this.parsers.flatMap((parser) => parser.senders.map((s) => s.toLowerCase()))),
    ];
  }

  /** Empty when any parser has no keywords: then no subject filter can be applied safely. */
  allSubjectKeywords(): string[] {
    if (this.parsers.some((parser) => !parser.subjectKeywords?.length)) return [];
    return [
      ...new Set(
        this.parsers.flatMap((parser) =>
          (parser.subjectKeywords ?? []).map((k) => k.toLowerCase()),
        ),
      ),
    ];
  }

  find(meta: EmailMeta): EmailParser | null {
    return (
      this.parsers.find(
        (parser) => matchesSender(meta.from, parser.senders) && parser.matches(meta),
      ) ?? null
    );
  }
}
