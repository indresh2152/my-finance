import { matchesSender } from './sender-match';
import type { EmailMeta, EmailParser } from './email-parser';

/** Bank parsers are added here in Phase 2 (card statements) and Phase 3 (balances). */
export const BANK_PARSERS: readonly EmailParser[] = [];

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

  find(meta: EmailMeta): EmailParser | null {
    return (
      this.parsers.find(
        (parser) => matchesSender(meta.from, parser.senders) && parser.matches(meta),
      ) ?? null
    );
  }
}
