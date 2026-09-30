import type { ParsedEmail } from '../services/mailbox/providers/mail-provider';

/** SBI_CARD (SBI Card, the card issuer) and SBI (State Bank of India) are separate companies. */
export type BankCode = 'HDFC' | 'ICICI' | 'SBI' | 'SBI_CARD' | 'AXIS' | 'KOTAK';

export interface CardStatementResult {
  kind: 'CARD_STATEMENT';
  issuingBank: BankCode;
  last4: string;
  statementDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  totalDue: number;
  minDue?: number;
  passwordHint?: string;
  attachment?: { locator: string; filename: string };
}

export interface AccountBalanceResult {
  kind: 'ACCOUNT_BALANCE';
  bankName: BankCode;
  last4: string;
  balance: number;
  asOf: string; // ISO timestamp
  accountType?: 'SAVINGS' | 'CURRENT' | 'OTHER';
}

export type ParsedResult = CardStatementResult | AccountBalanceResult;

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
  /** Pure: no I/O. Returns null when the email is not a usable statement/alert. */
  parse(email: ParsedEmail): ParsedResult | null;
}
