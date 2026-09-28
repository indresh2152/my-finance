import {
  registerMailboxJobs,
  enqueueMailboxSync,
  syncAllMailboxes,
  purgeExpiredOAuthStates,
  MAIL_SYNC_ALL_QUEUE,
  MAIL_SYNC_MAILBOX_QUEUE,
  OAUTH_STATES_PURGE_QUEUE,
  SyncJobError,
} from './mail-sync.jobs';

type Handler = (jobs: Array<{ data: unknown }>) => Promise<void>;

interface FakeBoss {
  handlers: Map<string, Handler>;
  createQueue: jest.Mock;
  work: jest.Mock;
  schedule: jest.Mock;
  send: jest.Mock;
}

const makeBoss = (): FakeBoss => {
  const handlers = new Map<string, Handler>();
  return {
    handlers,
    createQueue: jest.fn().mockResolvedValue(undefined),
    work: jest.fn(async (name: string, ...rest: unknown[]): Promise<string> => {
      handlers.set(name, rest[rest.length - 1] as Handler);
      return 'worker-id';
    }),
    schedule: jest.fn().mockResolvedValue(undefined),
    send: jest.fn().mockResolvedValue('job-id'),
  };
};

const handlerFor = (boss: FakeBoss, queue: string): Handler => {
  const handler = boss.handlers.get(queue);
  if (!handler) throw new Error(`no worker registered for ${queue}`);
  return handler;
};

const rejectionOf = async (promise: Promise<unknown>): Promise<Error> => {
  const outcome = await promise.then(
    () => null,
    (err: unknown) => err,
  );
  if (!(outcome instanceof Error)) throw new Error('expected the worker to reject with an Error');
  return outcome;
};

describe('enqueueMailboxSync', () => {
  it('should send a singleton job keyed by mailbox id', async () => {
    const boss = makeBoss();
    await enqueueMailboxSync(boss as never, 'mb-1');
    expect(boss.send).toHaveBeenCalledWith(
      MAIL_SYNC_MAILBOX_QUEUE,
      { mailboxId: 'mb-1' },
      { singletonKey: 'mb-1' },
    );
  });
});

describe('syncAllMailboxes', () => {
  it('should enqueue every active mailbox', async () => {
    const boss = makeBoss();
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'a' }, { id: 'b' }] }) };
    await expect(syncAllMailboxes(db as never, boss as never)).resolves.toBe(2);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("status = 'ACTIVE'"));
    expect(boss.send).toHaveBeenCalledTimes(2);
  });
});

describe('purgeExpiredOAuthStates', () => {
  it('should delete expired states and return the count', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 3 }) };
    await expect(purgeExpiredOAuthStates(db as never)).resolves.toBe(3);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM oauth_states WHERE expires_at < NOW()'),
    );
  });

  it('should return 0 when rowCount is null', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: null }) };
    await expect(purgeExpiredOAuthStates(db as never)).resolves.toBe(0);
  });
});

describe('registerMailboxJobs', () => {
  const setup = async (): Promise<{
    boss: FakeBoss;
    db: { query: jest.Mock };
    syncService: { syncMailbox: jest.Mock };
  }> => {
    const boss = makeBoss();
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'a' }], rowCount: 1 }) };
    const syncService = { syncMailbox: jest.fn().mockResolvedValue(null) };
    await registerMailboxJobs(boss as never, {
      db: db as never,
      syncService,
      syncCron: '0 */6 * * *',
    });
    return { boss, db, syncService };
  };

  it('should create the queues with their policies', async () => {
    const { boss } = await setup();
    expect(boss.createQueue).toHaveBeenCalledWith(MAIL_SYNC_MAILBOX_QUEUE, {
      name: MAIL_SYNC_MAILBOX_QUEUE,
      policy: 'stately',
      retryLimit: 3,
      retryBackoff: true,
      retryDelay: 60,
      expireInSeconds: 1800,
    });
    expect(boss.createQueue).toHaveBeenCalledWith(MAIL_SYNC_ALL_QUEUE, {
      name: MAIL_SYNC_ALL_QUEUE,
      policy: 'singleton',
    });
    expect(boss.createQueue).toHaveBeenCalledWith(OAUTH_STATES_PURGE_QUEUE, {
      name: OAUTH_STATES_PURGE_QUEUE,
      policy: 'singleton',
    });
  });

  it('should create queues before registering workers and schedules', async () => {
    const { boss } = await setup();
    const lastCreate = Math.max(...boss.createQueue.mock.invocationCallOrder);
    expect(Math.min(...boss.work.mock.invocationCallOrder)).toBeGreaterThan(lastCreate);
    expect(Math.min(...boss.schedule.mock.invocationCallOrder)).toBeGreaterThan(lastCreate);
  });

  it('should schedule the full sync and the oauth state purge', async () => {
    const { boss } = await setup();
    expect(boss.schedule).toHaveBeenCalledWith(MAIL_SYNC_ALL_QUEUE, '0 */6 * * *');
    expect(boss.schedule).toHaveBeenCalledWith(OAUTH_STATES_PURGE_QUEUE, '15 3 * * *');
  });

  it('should sync each mailbox in a batch in order', async () => {
    const { boss, syncService } = await setup();
    await handlerFor(
      boss,
      MAIL_SYNC_MAILBOX_QUEUE,
    )([{ data: { mailboxId: 'mb-1' } }, { data: { mailboxId: 'mb-2' } }]);
    expect(syncService.syncMailbox).toHaveBeenNthCalledWith(1, 'mb-1');
    expect(syncService.syncMailbox).toHaveBeenNthCalledWith(2, 'mb-2');
  });

  it('should fail the job with a sanitised error that leaks no message or detail', async () => {
    const { boss, syncService } = await setup();
    const pgError = Object.assign(new Error('value 45000.00 violates check for card 1234'), {
      detail: 'Key (last4)=(1234) password hint DOB',
      code: '23514',
    });
    syncService.syncMailbox.mockRejectedValueOnce(pgError);

    const failure = await rejectionOf(
      handlerFor(boss, MAIL_SYNC_MAILBOX_QUEUE)([{ data: { mailboxId: 'mb-1' } }]),
    );

    expect(failure).toBeInstanceOf(SyncJobError);
    expect(failure).toMatchObject({ errName: 'Error', code: '23514' });
    expect(failure).not.toHaveProperty('detail');
    expect(failure).not.toHaveProperty('cause');
    const serialised = JSON.stringify({
      ...failure,
      message: failure.message,
      stack: failure.stack,
    });
    for (const secret of ['45000', '1234', 'password', 'DOB']) {
      expect(serialised).not.toContain(secret);
    }
  });

  it('should drop an error code that is not a SQLSTATE', async () => {
    const { boss, syncService } = await setup();
    syncService.syncMailbox.mockRejectedValueOnce(
      Object.assign(new Error('x'), { code: 'user@example.com' }),
    );
    const failure = await rejectionOf(
      handlerFor(boss, MAIL_SYNC_MAILBOX_QUEUE)([{ data: { mailboxId: 'mb-1' } }]),
    );
    expect(failure).toMatchObject({ code: null });
    expect(failure.message).not.toContain('example.com');
  });

  it('should sanitise failures of the full-sync and purge workers too', async () => {
    const { boss, db } = await setup();
    db.query.mockRejectedValue('connection string postgres://secret');
    for (const queue of [MAIL_SYNC_ALL_QUEUE, OAUTH_STATES_PURGE_QUEUE]) {
      const failure = await rejectionOf(handlerFor(boss, queue)([{ data: {} }]));
      expect(failure).toMatchObject({ queue, errName: 'UnknownError', code: null });
      expect(failure.message).not.toContain('secret');
    }
  });

  it('should fan out the scheduled full sync to per-mailbox jobs', async () => {
    const { boss } = await setup();
    await handlerFor(boss, MAIL_SYNC_ALL_QUEUE)([{ data: {} }]);
    expect(boss.send).toHaveBeenCalledWith(
      MAIL_SYNC_MAILBOX_QUEUE,
      { mailboxId: 'a' },
      { singletonKey: 'a' },
    );
  });

  it('should purge expired oauth states on schedule', async () => {
    const { boss, db } = await setup();
    await handlerFor(boss, OAUTH_STATES_PURGE_QUEUE)([{ data: {} }]);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM oauth_states'));
  });
});
