import { createProviderRegistry, getProvider, type ProviderClients } from './index';
import { GoogleMailProvider } from './google.provider';
import { MicrosoftMailProvider } from './microsoft.provider';

const clients: ProviderClients = {
  google: { clientId: 'g', clientSecret: 'gs' },
  microsoft: { clientId: 'm', clientSecret: 'ms' },
};

describe('provider registry', () => {
  it('should register Google and Microsoft providers', () => {
    const registry = createProviderRegistry(clients);
    expect(getProvider(registry, 'GOOGLE')).toBeInstanceOf(GoogleMailProvider);
    expect(getProvider(registry, 'MICROSOFT')).toBeInstanceOf(MicrosoftMailProvider);
  });

  it('should register only the configured providers', () => {
    const registry = createProviderRegistry({ ...clients, microsoft: null });
    expect(getProvider(registry, 'GOOGLE')).toBeInstanceOf(GoogleMailProvider);
    expect(registry.has('MICROSOFT')).toBe(false);
  });

  it('should throw for an unregistered provider', () => {
    expect(() => getProvider(new Map(), 'GOOGLE')).toThrow(
      'No mail provider registered for GOOGLE',
    );
  });
});
