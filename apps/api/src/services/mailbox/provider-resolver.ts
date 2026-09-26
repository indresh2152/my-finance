import { promises as dns } from 'dns';
import { emailDomain } from '../../utils/email.utils';
import type { ProviderKey } from './providers/mail-provider';

export type Resolution = { supported: true; provider: ProviderKey } | { supported: false };

interface MxRecord {
  exchange: string;
  priority: number;
}

type MxLookup = (domain: string) => Promise<MxRecord[]>;

interface CacheEntry {
  value: Resolution;
  expiresAt: number;
}

const DNS_TIMEOUT_MS = 3000;
const CACHE_TTL_MS = 60 * 60 * 1000;
const UNSUPPORTED: Resolution = { supported: false };
const TRAILING_DOT = /\.$/;

const DOMAIN_PROVIDERS: Readonly<Record<string, ProviderKey>> = {
  'gmail.com': 'GOOGLE',
  'googlemail.com': 'GOOGLE',
  'outlook.com': 'MICROSOFT',
  'outlook.in': 'MICROSOFT',
  'hotmail.com': 'MICROSOFT',
  'live.com': 'MICROSOFT',
  'live.in': 'MICROSOFT',
  'msn.com': 'MICROSOFT',
};

const KNOWN_UNSUPPORTED_DOMAINS: ReadonlySet<string> = new Set([
  'yahoo.com',
  'yahoo.co.in',
  'ymail.com',
  'rediffmail.com',
  'icloud.com',
  'me.com',
]);

const MX_PROVIDERS: ReadonlyArray<{ domains: readonly string[]; provider: ProviderKey }> = [
  { domains: ['google.com', 'googlemail.com'], provider: 'GOOGLE' },
  { domains: ['mail.protection.outlook.com'], provider: 'MICROSOFT' },
];

const isHostInDomain = (host: string, domain: string): boolean =>
  host === domain || host.endsWith(`.${domain}`);

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('DNS lookup timed out')), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

const classify = (records: readonly MxRecord[]): Resolution => {
  const hosts = records.map((record) => record.exchange.toLowerCase().replace(TRAILING_DOT, ''));
  for (const { domains, provider } of MX_PROVIDERS) {
    if (hosts.some((host) => domains.some((domain) => isHostInDomain(host, domain)))) {
      return { supported: true, provider };
    }
  }
  return UNSUPPORTED;
};

/**
 * Maps an email address to a supported mail provider. Well-known consumer domains and a
 * small denylist resolve without DNS; everything else is classified from its MX records
 * (with results cached for an hour) so hosted Google Workspace / Microsoft 365 domains work too.
 */
export class ProviderResolver {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly mxLookup: MxLookup = (domain) => dns.resolveMx(domain),
    private readonly now: () => number = Date.now,
    private readonly timeoutMs: number = DNS_TIMEOUT_MS,
  ) {}

  async resolve(email: string): Promise<Resolution> {
    const domain = emailDomain(email);
    const mapped = DOMAIN_PROVIDERS[domain];
    if (mapped) {
      return { supported: true, provider: mapped };
    }
    if (!domain || KNOWN_UNSUPPORTED_DOMAINS.has(domain)) {
      return UNSUPPORTED;
    }
    return this.resolveViaMx(domain);
  }

  private async resolveViaMx(domain: string): Promise<Resolution> {
    const cached = this.cache.get(domain);
    if (cached && cached.expiresAt > this.now()) {
      return cached.value;
    }

    let records: MxRecord[];
    try {
      records = await withTimeout(this.mxLookup(domain), this.timeoutMs);
    } catch {
      return UNSUPPORTED; // Transient DNS failures are not cached.
    }

    const value = classify(records);
    this.cache.set(domain, { value, expiresAt: this.now() + CACHE_TTL_MS });
    return value;
  }
}
