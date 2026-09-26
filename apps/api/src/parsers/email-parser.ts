import type { ParsedEmail } from '../services/mailbox/providers/mail-provider';

export type BankCode = 'HDFC' | 'ICICI' | 'SBI_CARD' | 'AXIS' | 'KOTAK';

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
  matches(meta: EmailMeta): boolean;
  /** Pure: no I/O. Returns null when the email is not a usable statement/alert. */
  parse(email: ParsedEmail): ParsedResult | null;
}
