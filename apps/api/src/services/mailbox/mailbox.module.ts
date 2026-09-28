import type { Pool } from 'pg';
import type { MailboxConfig } from '../../config/mailbox.config';
import type { MailboxModule } from '../../routes/mailboxes.routes';
import { enqueueMailboxSync, registerMailboxJobs, type JobQueue } from '../../jobs/mail-sync.jobs';
import { BANK_PARSERS, ParserRegistry } from '../../parsers/registry';
import { createProviderRegistry } from './providers';
import { ProviderResolver } from './provider-resolver';
import { OAuthStateService } from './oauth-state.service';
import { RecordUpsertService } from './record-upsert.service';
import { MailSyncService } from './mail-sync.service';
import { MailboxService } from './mailbox.service';

export interface MailboxModuleDeps {
  db: Pool;
  config: MailboxConfig;
  boss: JobQueue;
}

/** Composition root for the mailbox feature: builds services and registers background jobs. */
export const createMailboxModule = async ({
  db,
  config,
  boss,
}: MailboxModuleDeps): Promise<MailboxModule> => {
  const providers = createProviderRegistry(config);

  const syncService = new MailSyncService({
    db,
    providers,
    parsers: new ParserRegistry(BANK_PARSERS),
    upserts: new RecordUpsertService(db),
    keyRing: config.keyRing,
  });
  await registerMailboxJobs(boss, { db, syncService, syncCron: config.syncCron });

  const service = new MailboxService({
    db,
    providers,
    resolver: new ProviderResolver(),
    oauthStates: new OAuthStateService(db, config.keyRing),
    keyRing: config.keyRing,
    emailHmacSecret: config.emailHmacSecret,
    appBaseUrl: config.appBaseUrl,
    enqueueSync: (mailboxId: string): Promise<void> => enqueueMailboxSync(boss, mailboxId),
  });

  return { service, appBaseUrl: config.appBaseUrl };
};
