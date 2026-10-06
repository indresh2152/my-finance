import { cardStatusEnum } from '../db/schema';
import { DAY_MS } from '../utils/time.utils';

/** The stored statuses plus INACTIVE, which is only ever worked out on read. */
export const CARD_STATUSES = [...cardStatusEnum.enumValues, 'INACTIVE'] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];
export type StoredCardStatus = (typeof cardStatusEnum.enumValues)[number];

/**
 * About two monthly billing cycles plus a few days for the email to arrive. Banks usually send no
 * statement for an unused card, so an ACTIVE card with none in that long is reported INACTIVE.
 */
const INACTIVE_AFTER_MS = 70 * DAY_MS;

/**
 * Measured from the newest sync of a mailbox holding the latest statement, not from today, so a
 * mailbox that stopped syncing can't make its cards look unused.
 */
export const deriveCardStatus = (
  storedStatus: StoredCardStatus,
  latestStatementDate: string | null,
  lastSyncedAt: Date | null,
): CardStatus => {
  if (storedStatus !== 'ACTIVE' || latestStatementDate === null || lastSyncedAt === null) {
    return storedStatus;
  }
  const ageMs = lastSyncedAt.getTime() - Date.parse(latestStatementDate);
  return ageMs > INACTIVE_AFTER_MS ? 'INACTIVE' : storedStatus;
};
