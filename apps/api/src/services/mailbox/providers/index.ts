import type { MailboxConfig } from '../../../config/mailbox.config';
import { GoogleMailProvider } from './google.provider';
import { MicrosoftMailProvider } from './microsoft.provider';
import type { MailProvider, ProviderKey } from './mail-provider';

export type ProviderRegistry = ReadonlyMap<ProviderKey, MailProvider>;

export type ProviderClients = Pick<MailboxConfig, 'google' | 'microsoft'>;

/** Registers only the providers whose OAuth client is configured. */
export const createProviderRegistry = ({
  google,
  microsoft,
}: ProviderClients): ProviderRegistry => {
  const registry = new Map<ProviderKey, MailProvider>();
  if (google) {
    registry.set('GOOGLE', new GoogleMailProvider(google.clientId, google.clientSecret));
  }
  if (microsoft) {
    registry.set(
      'MICROSOFT',
      new MicrosoftMailProvider(microsoft.clientId, microsoft.clientSecret),
    );
  }
  return registry;
};

export const getProvider = (registry: ProviderRegistry, key: ProviderKey): MailProvider => {
  const provider = registry.get(key);
  if (!provider) {
    throw new Error(`No mail provider registered for ${key}`);
  }
  return provider;
};
