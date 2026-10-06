import { createMailboxModule } from './mailbox.module';
import { StatementDownloadService } from './statement-download.service';
import { MailboxService } from './mailbox.service';
import { MAIL_SYNC_ALL_QUEUE, MAIL_SYNC_MAILBOX_QUEUE } from '../../jobs/mail-sync.jobs';
import { parseKeyRing } from '../../utils/crypto.utils';
import type { MailboxConfig } from '../../config/mailbox.config';

const config: MailboxConfig = {
  appBaseUrl: 'https://app.example',
  google: { clientId: 'g', clientSecret: 'gs' },
  microsoft: { clientId: 'm', clientSecret: 'ms' },
  keyRing: parseKeyRing(`1:${'aa'.repeat(32)}`, 1),
  emailHmacSecret: 'h'.repeat(32),
  syncCron: '0 */6 * * *',
};

interface FakeBoss {
  createQueue: jest.Mock;
  work: jest.Mock;
  schedule: jest.Mock;
  send: jest.Mock;
}

const makeBoss = (): FakeBoss => ({
  createQueue: jest.fn().mockResolvedValue(undefined),
  work: jest.fn().mockResolvedValue('w'),
  schedule: jest.fn().mockResolvedValue(undefined),
  send: jest.fn().mockResolvedValue('job'),
});

const makeDb = (): { query: jest.Mock; connect: jest.Mock } => ({
  query: jest.fn(),
  connect: jest.fn(),
});

describe('createMailboxModule', () => {
  it('should register jobs and expose a mailbox service', async () => {
    const boss = makeBoss();

    const module = await createMailboxModule({
      db: makeDb() as never,
      config,
      boss: boss as never,
    });

    expect(module.appBaseUrl).toBe('https://app.example');
    expect(module.service).toBeInstanceOf(MailboxService);
    expect(module.statements).toBeInstanceOf(StatementDownloadService);
    expect(boss.work).toHaveBeenCalledTimes(3);
    expect(boss.schedule).toHaveBeenCalledWith(MAIL_SYNC_ALL_QUEUE, '0 */6 * * *');
  });

  it('should enqueue syncs through pg-boss', async () => {
    const boss = makeBoss();
    const module = await createMailboxModule({
      db: makeDb() as never,
      config,
      boss: boss as never,
    });
    const { enqueueSync } = (
      module.service as unknown as { deps: { enqueueSync: (id: string) => Promise<void> } }
    ).deps;

    await enqueueSync('mb-1');

    expect(boss.send).toHaveBeenCalledWith(
      MAIL_SYNC_MAILBOX_QUEUE,
      { mailboxId: 'mb-1' },
      { singletonKey: 'mb-1' },
    );
  });

  it('should propagate job registration failures so startup fails fast', async () => {
    const boss = makeBoss();
    boss.createQueue.mockRejectedValueOnce(new Error('pgboss schema missing'));

    await expect(
      createMailboxModule({ db: makeDb() as never, config, boss: boss as never }),
    ).rejects.toThrow('pgboss schema missing');
  });
});
