import type { Pool } from 'pg';
import type { bankAccountTypeEnum } from '../../db/mailbox.schema';
import { writeAuditLog } from '../audit-log.writer';
import { requirePanProfileId } from '../pan-profile.lookup';
import type { RequestContext } from './mailbox.types';

const RESOURCE_TYPE = 'bank_account';

/** Each EMAIL account with the newest balance any of the caller's mailboxes has seen for it. */
const LIST_ACCOUNTS_SQL = `SELECT a.id, a.bank_name, a.account_number_last4, a.account_type,
          s.available_balance, s.balance_as_of
   FROM bank_accounts a
   JOIN LATERAL (
     SELECT available_balance, balance_as_of
     FROM account_balance_snapshots
     WHERE bank_account_id = a.id
     ORDER BY balance_as_of DESC, updated_at DESC
     LIMIT 1
   ) s ON TRUE
   WHERE a.pan_profile_id = $1 AND a.source = 'EMAIL'
   ORDER BY a.bank_name, a.account_number_last4`;

export type BankAccountType = (typeof bankAccountTypeEnum.enumValues)[number];

interface AccountRow {
  readonly id: string;
  readonly bank_name: string;
  readonly account_number_last4: string;
  readonly account_type: BankAccountType;
  /** NUMERIC arrives as a string. */
  readonly available_balance: string;
  readonly balance_as_of: Date;
}

export interface EmailAccount {
  readonly id: string;
  readonly bankName: string;
  readonly accountNumberLast4: string;
  readonly accountType: BankAccountType;
  readonly availableBalance: number;
  /** ISO timestamp of the email (or the date it states) the balance came from. */
  readonly balanceAsOf: string;
}

const toAccount = (row: AccountRow): EmailAccount => ({
  id: row.id,
  bankName: row.bank_name,
  accountNumberLast4: row.account_number_last4,
  accountType: row.account_type,
  availableBalance: Number(row.available_balance),
  balanceAsOf: row.balance_as_of.toISOString(),
});

/** Bank accounts found in the caller's linked mailboxes. */
export class EmailAccountsService {
  constructor(private readonly db: Pick<Pool, 'query'>) {}

  async list(ctx: RequestContext): Promise<EmailAccount[]> {
    const panProfileId = await requirePanProfileId(this.db, ctx.userId, ctx.lng);
    const { rows } = await this.db.query<AccountRow>(LIST_ACCOUNTS_SQL, [panProfileId]);
    await writeAuditLog(this.db, {
      userId: ctx.userId,
      action: 'EMAIL_ACCOUNT_LIST',
      resourceType: RESOURCE_TYPE,
      ipAddress: ctx.ip,
      metadata: { count: rows.length },
    });
    return rows.map(toAccount);
  }
}
