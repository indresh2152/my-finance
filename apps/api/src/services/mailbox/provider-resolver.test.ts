import { ProviderResolver } from './provider-resolver';

interface MxRecord {
  exchange: string;
  priority: number;
}

const mx = (...exchanges: string[]): MxRecord[] =>
  exchanges.map((exchange, priority) => ({ exchange, priority }));

describe('ProviderResolver', () => {
  it('should resolve well-known consumer domains without DNS', async () => {
    const lookup = jest.fn();
    const resolver = new ProviderResolver(lookup);
    await expect(resolver.resolve('a@gmail.com')).resolves.toEqual({
      supported: true,
      provider: 'GOOGLE',
    });
    await expect(resolver.resolve('a@Hotmail.com')).resolves.toEqual({
      supported: true,
      provider: 'MICROSOFT',
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('should report known unsupported providers without DNS', async () => {
    const lookup = jest.fn();
    await expect(new ProviderResolver(lookup).resolve('a@yahoo.co.in')).resolves.toEqual({
      supported: false,
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('should detect Google Workspace from MX records', async () => {
    const resolver = new ProviderResolver(jest.fn().mockResolvedValue(mx('ASPMX.L.GOOGLE.COM.')));
    await expect(resolver.resolve('me@company.in')).resolves.toEqual({
      supported: true,
      provider: 'GOOGLE',
    });
  });

  it('should detect Microsoft 365 from MX records', async () => {
    const resolver = new ProviderResolver(
      jest.fn().mockResolvedValue(mx('company-in.mail.protection.outlook.com')),
    );
    await expect(resolver.resolve('me@company.in')).resolves.toEqual({
      supported: true,
      provider: 'MICROSOFT',
    });
  });

  it('should not be fooled by look-alike MX hosts', async () => {
    const resolver = new ProviderResolver(jest.fn().mockResolvedValue(mx('mx.evilgoogle.com')));
    await expect(resolver.resolve('me@company.in')).resolves.toEqual({ supported: false });
  });

  it('should treat DNS failures as unsupported and not cache them', async () => {
    const lookup = jest
      .fn()
      .mockRejectedValueOnce(new Error('ENOTFOUND'))
      .mockResolvedValueOnce(mx('aspmx.l.google.com'));
    const resolver = new ProviderResolver(lookup);
    await expect(resolver.resolve('me@company.in')).resolves.toEqual({ supported: false });
    await expect(resolver.resolve('me@company.in')).resolves.toEqual({
      supported: true,
      provider: 'GOOGLE',
    });
  });

  it('should time out slow DNS lookups', async () => {
    const lookup = jest.fn().mockImplementation(() => new Promise(() => undefined));
    const resolver = new ProviderResolver(lookup, Date.now, 10);
    await expect(resolver.resolve('me@slow.in')).resolves.toEqual({ supported: false });
  });

  it('should cache successful lookups for an hour', async () => {
    let now = 0;
    const lookup = jest.fn().mockResolvedValue(mx('aspmx.l.google.com'));
    const resolver = new ProviderResolver(lookup, () => now);
    await resolver.resolve('a@company.in');
    await resolver.resolve('b@company.in');
    expect(lookup).toHaveBeenCalledTimes(1);
    now = 60 * 60 * 1000 + 1;
    await resolver.resolve('c@company.in');
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('should reject input without a domain', async () => {
    await expect(new ProviderResolver(jest.fn()).resolve('nodomain')).resolves.toEqual({
      supported: false,
    });
  });
});
