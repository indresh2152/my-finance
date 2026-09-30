import { createAccountBalanceParser } from '../account-balance.parser';
import type { BankCode, EmailParser } from '../email-parser';
import { BANK_SENDERS } from './senders';

/** State Bank of India, not SBI Card: the card issuer does not hold bank accounts. */
const ACCOUNT_BANKS: readonly BankCode[] = ['HDFC', 'ICICI', 'SBI', 'AXIS', 'KOTAK'];

export const ACCOUNT_BALANCE_PARSERS: readonly EmailParser[] = ACCOUNT_BANKS.map((bankName) =>
  createAccountBalanceParser({ bankName, senders: BANK_SENDERS[bankName] }),
);
