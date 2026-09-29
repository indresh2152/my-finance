import { MicrosoftMailProvider } from './microsoft.provider';
import {
  ProviderNotFoundError,
  ProviderRequestError,
  ReauthRequiredError,
  type MessageRef,
} from './mail-provider';
import { jsonResponse, initAt, urlAt, spyOnFetch } from '../../../test/fetch-mock';

const provider = new MicrosoftMailProvider('client-id', 'client-secret');
const SCOPES =
  'offline_access https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read';

const collect = async (iterable: AsyncIterable<MessageRef>): Promise<string[]> => {
  const ids: string[] = [];
  for await (const ref of iterable) ids.push(ref.id);
  return ids;
};

afterEach(() => jest.restoreAllMocks());

describe('MicrosoftMailProvider.buildAuthUrl', () => {
  it('should request Mail.Read with offline access, PKCE and a login hint', () => {
    const url = new URL(
      provider.buildAuthUrl({
        state: 'st',
        codeChallenge: 'ch',
        loginHint: 'a@outlook.com',
        redirectUri: 'https://app/cb',
      }),
    );
    expect(url.origin + url.pathname).toBe(
      'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    );
    expect(url.searchParams.get('scope')).toBe(SCOPES);
    expect(url.searchParams.get('response_mode')).toBe('query');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('login_hint')).toBe('a@outlook.com');
  });
});

describe('MicrosoftMailProvider.exchangeCode', () => {
  it('should exchange the code and read the account email from /me', async () => {
    const fetchSpy = spyOnFetch()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'at', refresh_token: 'rt' }))
      .mockResolvedValueOnce(
        jsonResponse({ mail: 'User@Outlook.com', userPrincipalName: 'upn@x.com' }),
      );
    await expect(
      provider.exchangeCode({ code: 'c', codeVerifier: 'v', redirectUri: 'r' }),
    ).resolves.toEqual({
      refreshToken: 'rt',
      accountEmail: 'User@Outlook.com',
    });
    const form = initAt(fetchSpy, 0).body as URLSearchParams;
    expect(form.get('code_verifier')).toBe('v');
    expect(form.get('scope')).toBe(SCOPES);
  });

  it('should fall back to userPrincipalName when mail is null', async () => {
    spyOnFetch()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'at', refresh_token: 'rt' }))
      .mockResolvedValueOnce(jsonResponse({ mail: null, userPrincipalName: 'upn@contoso.com' }));
    await expect(
      provider.exchangeCode({ code: 'c', codeVerifier: 'v', redirectUri: 'r' }),
    ).resolves.toMatchObject({
      accountEmail: 'upn@contoso.com',
    });
  });

  it('should fail when no refresh token is returned', async () => {
    spyOnFetch().mockResolvedValueOnce(jsonResponse({ access_token: 'at' }));
    await expect(
      provider.exchangeCode({ code: 'c', codeVerifier: 'v', redirectUri: 'r' }),
    ).rejects.toBeInstanceOf(ProviderRequestError);
  });
});

describe('MicrosoftMailProvider.getAccessToken', () => {
  it('should return the rotated refresh token', async () => {
    spyOnFetch().mockResolvedValueOnce(jsonResponse({ access_token: 'at', refresh_token: 'rt2' }));
    await expect(provider.getAccessToken('rt')).resolves.toEqual({
      accessToken: 'at',
      rotatedRefreshToken: 'rt2',
    });
  });

  it('should return null rotation when no new refresh token is issued', async () => {
    spyOnFetch().mockResolvedValueOnce(jsonResponse({ access_token: 'at' }));
    await expect(provider.getAccessToken('rt')).resolves.toEqual({
      accessToken: 'at',
      rotatedRefreshToken: null,
    });
  });

  it('should surface invalid_grant as ReauthRequiredError', async () => {
    spyOnFetch().mockResolvedValueOnce(jsonResponse({ error: 'invalid_grant' }, 400));
    await expect(provider.getAccessToken('rt')).rejects.toBeInstanceOf(ReauthRequiredError);
  });
});

describe('MicrosoftMailProvider.revoke', () => {
  it('should not call Microsoft (no per-app revoke endpoint for delegated consent)', async () => {
    const fetchSpy = spyOnFetch();
    await provider.revoke('rt');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('MicrosoftMailProvider.search', () => {
  it('should skip messages whose subject has none of the keywords', async () => {
    const from = { emailAddress: { address: 'x@hdfcbank.net' } };
    spyOnFetch().mockResolvedValueOnce(
      jsonResponse({
        value: [
          { id: 'm1', from, subject: 'Your Credit Card STATEMENT' },
          { id: 'm2', from, subject: 'OTP for your transaction' },
          { id: 'm3', from },
        ],
      }),
    );
    const ids = await collect(
      provider.search('at', {
        senders: ['@hdfcbank.net'],
        subjectKeywords: ['statement'],
        since: new Date(0),
      }),
    );
    expect(ids).toEqual(['m1']);
  });

  it('should stop paginating when @odata.nextLink repeats the previous link', async () => {
    const nextLink = 'https://graph.microsoft.com/v1.0/me/messages?page=2';
    const fetchSpy = spyOnFetch()
      .mockResolvedValueOnce(
        jsonResponse({
          value: [{ id: 'm1', from: { emailAddress: { address: 'x@hdfcbank.net' } } }],
          '@odata.nextLink': nextLink,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          value: [{ id: 'm2', from: { emailAddress: { address: 'x@hdfcbank.net' } } }],
          '@odata.nextLink': nextLink,
        }),
      )
      .mockRejectedValue(new Error('fetched past repeated link'));
    const since = new Date('2026-09-01T00:00:00.000Z');
    const ids = await collect(
      provider.search('at', { senders: ['@hdfcbank.net'], subjectKeywords: [], since }),
    );
    expect(ids).toEqual(['m1', 'm2']);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('should filter by date on the server, by sender locally, and follow nextLink', async () => {
    const fetchSpy = spyOnFetch()
      .mockResolvedValueOnce(
        jsonResponse({
          value: [
            { id: 'm1', from: { emailAddress: { address: 'Alerts@HDFCBank.net' } } },
            { id: 'm2', from: { emailAddress: { address: 'friend@gmail.com' } } },
            { id: 'm3' },
          ],
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/messages?page=2',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          value: [{ id: 'm4', from: { emailAddress: { address: 'x@hdfcbank.net' } } }],
        }),
      );
    const since = new Date('2026-09-01T00:00:00.000Z');
    const ids = await collect(
      provider.search('at', { senders: ['@hdfcbank.net'], subjectKeywords: [], since }),
    );
    expect(ids).toEqual(['m1', 'm4']);
    const firstUrl = decodeURIComponent(urlAt(fetchSpy, 0));
    expect(firstUrl).toContain('$filter=receivedDateTime ge 2026-09-01T00:00:00.000Z');
    expect(firstUrl).toContain('$select=id,from,subject,receivedDateTime');
    expect(urlAt(fetchSpy, 1)).toBe('https://graph.microsoft.com/v1.0/me/messages?page=2');
  });
});

describe('MicrosoftMailProvider.getMessage', () => {
  it('should map a text body and attachments', async () => {
    const fetchSpy = spyOnFetch().mockResolvedValueOnce(
      jsonResponse({
        id: 'm1',
        subject: 'Statement',
        receivedDateTime: '2026-09-05T10:00:00Z',
        from: { emailAddress: { address: 'Cards@AxisBank.com' } },
        body: { contentType: 'text', content: 'Total due 500' },
        attachments: [{ id: 'a1', name: 'stmt.pdf', contentType: 'application/pdf' }],
      }),
    );
    await expect(provider.getMessage('at', 'm1')).resolves.toEqual({
      id: 'm1',
      from: 'cards@axisbank.com',
      subject: 'Statement',
      receivedAt: new Date('2026-09-05T10:00:00Z'),
      text: 'Total due 500',
      attachments: [{ locator: 'a1', filename: 'stmt.pdf', mimeType: 'application/pdf' }],
    });
    const headers = initAt(fetchSpy, 0).headers as Record<string, string>;
    expect(headers['Prefer']).toBe('outlook.body-content-type="text"');
  });

  it('should strip an HTML body and tolerate missing fields', async () => {
    spyOnFetch().mockResolvedValueOnce(
      jsonResponse({
        id: 'm2',
        receivedDateTime: '2026-09-05T10:00:00Z',
        body: { contentType: 'html', content: '<p>Hi</p>' },
      }),
    );
    await expect(provider.getMessage('at', 'm2')).resolves.toMatchObject({
      from: '',
      subject: '',
      text: 'Hi',
      attachments: [],
    });
  });
});

describe('MicrosoftMailProvider.getAttachment', () => {
  it('should decode contentBytes', async () => {
    spyOnFetch().mockResolvedValueOnce(
      jsonResponse({ contentBytes: Buffer.from('%PDF').toString('base64') }),
    );
    await expect(provider.getAttachment('at', 'm1', 'a1')).resolves.toEqual(Buffer.from('%PDF'));
  });

  it('should throw ProviderNotFoundError when contentBytes is missing', async () => {
    spyOnFetch().mockResolvedValueOnce(jsonResponse({}));
    await expect(provider.getAttachment('at', 'm1', 'a1')).rejects.toBeInstanceOf(
      ProviderNotFoundError,
    );
  });
});
