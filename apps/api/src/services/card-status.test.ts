import { deriveCardStatus } from './card-status';

describe('deriveCardStatus', () => {
  const SYNCED_AT = new Date('2026-10-06T00:00:00Z');

  it('should keep an ACTIVE card whose latest statement is exactly 70 days old', () => {
    expect(deriveCardStatus('ACTIVE', '2026-07-28', SYNCED_AT)).toBe('ACTIVE');
  });

  it('should report an ACTIVE card whose latest statement is 71 days old as INACTIVE', () => {
    expect(deriveCardStatus('ACTIVE', '2026-07-27', SYNCED_AT)).toBe('INACTIVE');
  });

  it('should keep the stored status of a card with no statement', () => {
    expect(deriveCardStatus('ACTIVE', null, SYNCED_AT)).toBe('ACTIVE');
  });

  it('should keep the stored status when its mailboxes have never synced', () => {
    expect(deriveCardStatus('ACTIVE', '2025-01-01', null)).toBe('ACTIVE');
  });

  it.each(['BLOCKED', 'EXPIRED', 'CLOSED'] as const)(
    'should never replace a stored %s status',
    (status) => {
      expect(deriveCardStatus(status, '2025-01-01', SYNCED_AT)).toBe(status);
    },
  );
});
