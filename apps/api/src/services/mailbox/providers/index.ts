import type { OAuthClientConfig } from '../../../config/mailbox.config';
import { GoogleMailProvider } from './google.provider';
import { MicrosoftMailProvider } from './microsoft.provider';
import type { MailProvider, ProviderKey } from './mail-provider';

export type ProviderRegistry = ReadonlyMap<ProviderKey, MailProvider>;

export interface ProviderClients {
  google: OAuthClientConfig;
  microsoft: OAuthClientConfig;
}

export const createProviderRegistry = (clients: ProviderClients): ProviderRegistry =>
  new Map<ProviderKey, MailProvider>([
    ['GOOGLE', new GoogleMailProvider(clients.google.clientId, clients.google.clientSecret)],
    [
      'MICROSOFT',
      new MicrosoftMailProvider(clients.microsoft.clientId, clients.microsoft.clientSecret),
    ],
  ]);

export const getProvider = (registry: ProviderRegistry, key: ProviderKey): MailProvider => {
  const provider = registry.get(key);
  if (!provider) {
    throw new Error(`No mail provider registered for ${key}`);
  }
  return provider;
};
