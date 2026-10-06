import type { ParsedEmail } from '../services/mailbox/providers/mail-provider';

/** SBI_CARD is SBI Card, the card issuer; State Bank of India itself issues no cards we parse. */
export type BankCode = 'HDFC' | 'ICICI' | 'SBI_CARD' | 'AXIS' | 'KOTAK' | 'FEDERAL';

export interface CardStatementResult {
  kind: 'CARD_STATEMENT';
  issuingBank: BankCode;
  /** Every result has last4 or cardName: some banks' emails never show the card's digits. */
  last4?: string;
  /** The card's name from the subject ('Pixel Play'), when the subject names one. */
  cardName?: string;
  statementDate: string; // YYYY-MM-DD
  /** Absent only when nothing is due ('No Payment Due'). */
  dueDate?: string; // YYYY-MM-DD
  totalDue: number;
  minDue?: number;
  passwordHint?: string;
  attachment?: { locator: string; filename: string };
}

export type ParsedResult = CardStatementResult;

export interface EmailMeta {
  from: string;
  subject: string;
}

export interface EmailParser {
  readonly key: string;
  /** Exact addresses or '@domain' entries. */
  readonly senders: readonly string[];
  /**
   * Words every matching subject contains, used to narrow the provider search so unrelated mail
   * (OTPs, alerts) is never downloaded. Omit only when no such word exists; it disables the filter.
   */
  readonly subjectKeywords?: readonly string[];
  matches(meta: EmailMeta): boolean;
  /** Pure: no I/O. Returns null when the email is not a usable card statement. */
  parse(email: ParsedEmail): ParsedResult | null;
}
