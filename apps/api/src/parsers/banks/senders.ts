import type { BankCode } from '../email-parser';

/**
 * Sender domains per bank, including the `.bank.in` domains RBI requires banks to move to. Written
 * from public templates, not real mail: after the first real sync, check the MAILBOX_SYNC audit
 * counts (scanned = 0 means a sender is wrong; scanned > 0 with parsed = 0 means a pattern is wrong).
 */
export const BANK_SENDERS: Readonly<Record<BankCode, readonly string[]>> = {
  HDFC: ['@hdfcbank.net', '@hdfcbank.com', '@hdfc.bank.in'],
  ICICI: ['@icicibank.com', '@icici.bank.in'],
  SBI_CARD: ['@sbicard.com'],
  AXIS: ['@axisbank.com', '@axis.bank.in'],
  KOTAK: ['@kotak.com', '@kotakbank.com', '@kotak.bank.in'],
  // Federal Bank's co-branded cards mail from their partners: Scapia, and OneCard (getonecard.app).
  FEDERAL: ['@federalbank.co.in', '@federal.bank.in', '@getonecard.app'],
};

/**
 * Words naming the bank in its card emails' subjects ('Your HDFC Bank Pixel Play Credit Card
 * Statement'), so they are not taken for the card's name. A Record, so a new bank needs its entry.
 */
export const BANK_NAME_WORDS: Readonly<Record<BankCode, readonly string[]>> = {
  HDFC: ['hdfc'],
  ICICI: ['icici'],
  SBI_CARD: ['sbi'],
  AXIS: ['axis'],
  KOTAK: ['kotak', 'mahindra'],
  FEDERAL: ['federal'],
};
