import type { BankCode } from '../email-parser';

/**
 * Sender domains per bank, including the `.bank.in` domains RBI requires banks to move to. Written
 * from public templates, not real mail: after the first real sync, check the MAILBOX_SYNC audit
 * counts (scanned = 0 means a sender is wrong; scanned > 0 with parsed = 0 means a pattern is wrong).
 */
export const BANK_SENDERS: Readonly<Record<BankCode, readonly string[]>> = {
  HDFC: ['@hdfcbank.net', '@hdfcbank.com', '@hdfc.bank.in'],
  ICICI: ['@icicibank.com', '@icici.bank.in'],
  SBI: ['@sbi.co.in', '@sbi.bank.in'],
  SBI_CARD: ['@sbicard.com'],
  AXIS: ['@axisbank.com', '@axis.bank.in'],
  KOTAK: ['@kotak.com', '@kotakbank.com', '@kotak.bank.in'],
};
