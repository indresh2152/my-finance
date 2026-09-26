import { GoogleMailProvider } from './google.provider';
import {
  ProviderNotFoundError,
  ProviderRequestError,
  ReauthRequiredError,
  type MessageRef,
} from './mail-provider';
import { jsonResponse, initAt, urlAt, spyOnFetch } from '../../../test/fetch-mock';

const b64 = (text: string): string => Buffer.from(text, 'utf8').toString('base64url');
const provider = new GoogleMailProvider('client-id', 'client-secret');

const collect = async (iterable: AsyncIterable<MessageRef>): Promise<string[]> => {
  const ids: string[] = [];
  for await (const ref of iterable) ids.push(ref.id);
  return ids;
};

afterEach(() => jest.restoreAllMocks());

describe('GoogleMailProvider.buildAuthUrl', () => {
  it('should request offline gmail.readonly access with PKCE and a login hint', () => {
    const url = new URL(
      provider.buildAuthUrl({
        state: 'st',
        codeChallenge: 'ch',
        loginHint: 'a@gmail.com',
        redirectUri: 'https://app/cb',
      }),
    );
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/gmail.readonly');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('code_challenge')).toBe('ch');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('login_hint')).toBe('a@gmail.com');
    expect(url.searchParams.get('state')).toBe('st');
    expect(url.searchParams.get('redirect_uri')).toBe('https://app/cb');
  });
});

describe('GoogleMailProvider.exchangeCode', () => {
  it('should exchange the code with the PKCE verifier and read the account email', async () => {
    const fetchSpy = spyOnFetch()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'at', refresh_token: 'rt' }))
      .mockResolvedValueOnce(jsonResponse({ emailAddress: 'User@Gmail.com' }));
    const result = await provider.exchangeCode({
      code: 'c',
      codeVerifier: 'v',
      redirectUri: 'https://app/cb',
    });
    expect(result).toEqual({ refreshToken: 'rt', accountEmail: 'User@Gmail.com' });
    const form = initAt(fetchSpy, 0).body as URLSearchParams;
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(form.get('code_verifier')).toBe('v');
    expect(form.get('client_secret')).toBe('client-secret');
    expect(urlAt(fetchSpy, 1)).toBe('https://gmail.googleapis.com/gmail/v1/users/me/profile');
  });

  it('should fail when Google does not return a refresh token', async () => {
    spyOnFetch().mockResolvedValueOnce(jsonResponse({ access_token: 'at' }));
    await expect(
      provider.exchangeCode({ code: 'c', codeVerifier: 'v', redirectUri: 'r' }),
    ).rejects.toBeInstanceOf(ProviderRequestError);
  });
});

describe('GoogleMailProvider.getAccessToken', () => {
  it('should return the access token and no rotation when none is issued', async () => {
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

  it('should return the rotated refresh token when Google issues a new one', async () => {
    spyOnFetch().mockResolvedValueOnce(jsonResponse({ access_token: 'at', refresh_token: 'rt2' }));
    await expect(provider.getAccessToken('rt')).resolves.toEqual({
      accessToken: 'at',
      rotatedRefreshToken: 'rt2',
    });
  });
});

describe('GoogleMailProvider.revoke', () => {
  it('should post the token to the revoke endpoint', async () => {
    const fetchSpy = spyOnFetch().mockResolvedValueOnce(new Response(null, { status: 200 }));
    await provider.revoke('rt');
    expect(urlAt(fetchSpy, 0)).toBe('https://oauth2.googleapis.com/revoke');
    expect((initAt(fetchSpy, 0).body as URLSearchParams).get('token')).toBe('rt');
  });

  it('should treat an already-invalid token (400) as revoked', async () => {
    spyOnFetch().mockResolvedValueOnce(new Response(null, { status: 400 }));
    await expect(provider.revoke('rt')).resolves.toBeUndefined();
  });

  it('should throw on server errors', async () => {
    spyOnFetch().mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(provider.revoke('rt')).rejects.toBeInstanceOf(ProviderRequestError);
  });
});

describe('GoogleMailProvider.search', () => {
  it('should query by sender and date, following pagination', async () => {
    const fetchSpy = spyOnFetch()
      .mockResolvedValueOnce(jsonResponse({ messages: [{ id: 'm1' }], nextPageToken: 'p2' }))
      .mockResolvedValueOnce(jsonResponse({ messages: [{ id: 'm2' }] }));
    const since = new Date('2026-09-01T00:00:00Z');
    const ids = await collect(
      provider.search('at', { senders: ['@hdfcbank.net', 'x@axisbank.com'], since }),
    );
    expect(ids).toEqual(['m1', 'm2']);
    const firstUrl = new URL(urlAt(fetchSpy, 0));
    expect(firstUrl.searchParams.get('q')).toBe(
      `from:(hdfcbank.net OR x@axisbank.com) after:${since.getTime() / 1000}`,
    );
    expect(new URL(urlAt(fetchSpy, 1)).searchParams.get('pageToken')).toBe('p2');
  });

  it('should split long sender lists into chunks of 20', async () => {
    const fetchSpy = spyOnFetch()
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ messages: [{ id: 'm9' }] }));
    const senders = Array.from({ length: 21 }, (_v, i) => `s${i}@bank.com`);
    const ids = await collect(provider.search('at', { senders, since: new Date(0) }));
    expect(ids).toEqual(['m9']);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('should stop paginating when nextPageToken repeats the previous token', async () => {
    const fetchSpy = spyOnFetch()
      .mockResolvedValueOnce(jsonResponse({ messages: [{ id: 'm1' }], nextPageToken: 'p1' }))
      .mockResolvedValueOnce(jsonResponse({ messages: [{ id: 'm2' }], nextPageToken: 'p1' }))
      .mockRejectedValue(new Error('fetched past repeated token'));
    const ids = await collect(
      provider.search('at', { senders: ['x@axisbank.com'], since: new Date(0) }),
    );
    expect(ids).toEqual(['m1', 'm2']);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe('GoogleMailProvider.getMessage', () => {
  it('should prefer the text/plain body and list attachments by part id', async () => {
    spyOnFetch().mockResolvedValueOnce(
      jsonResponse({
        id: 'm1',
        internalDate: '1758700000000',
        payload: {
          mimeType: 'multipart/mixed',
          headers: [
            { name: 'From', value: 'HDFC Bank <EmailStatements@HDFCBank.net>' },
            { name: 'Subject', value: 'Your statement' },
          ],
          parts: [
            {
              partId: '0',
              mimeType: 'multipart/alternative',
              parts: [
                { partId: '0.0', mimeType: 'text/plain', body: { data: b64('Total due Rs 100') } },
                { partId: '0.1', mimeType: 'text/html', body: { data: b64('<b>ignored</b>') } },
              ],
            },
            {
              partId: '1',
              mimeType: 'application/pdf',
              filename: 'stmt.pdf',
              body: { attachmentId: 'att-1' },
            },
          ],
        },
      }),
    );
    const email = await provider.getMessage('at', 'm1');
    expect(email).toEqual({
      id: 'm1',
      from: 'emailstatements@hdfcbank.net',
      subject: 'Your statement',
      receivedAt: new Date(1758700000000),
      text: 'Total due Rs 100',
      attachments: [{ locator: '1', filename: 'stmt.pdf', mimeType: 'application/pdf' }],
    });
  });

  it('should fall back to stripped HTML when there is no plain part', async () => {
    spyOnFetch().mockResolvedValueOnce(
      jsonResponse({
        id: 'm2',
        internalDate: '0',
        payload: {
          mimeType: 'text/html',
          headers: [],
          body: { data: b64('<p>Hello</p><p>World</p>') },
        },
      }),
    );
    const email = await provider.getMessage('at', 'm2');
    expect(email.text).toBe('Hello\nWorld');
    expect(email.from).toBe('');
    expect(email.attachments).toEqual([]);
  });

  it('should return empty text when the message has no body parts', async () => {
    spyOnFetch().mockResolvedValueOnce(
      jsonResponse({
        id: 'm3',
        internalDate: '0',
        payload: { mimeType: 'multipart/mixed', headers: [] },
      }),
    );
    await expect(provider.getMessage('at', 'm3')).resolves.toMatchObject({ text: '' });
  });
});

describe('GoogleMailProvider.getAttachment', () => {
  const message = {
    id: 'm1',
    internalDate: '0',
    payload: {
      mimeType: 'multipart/mixed',
      parts: [
        {
          partId: '1',
          mimeType: 'application/pdf',
          filename: 'a.pdf',
          body: { attachmentId: 'att-fresh' },
        },
        { partId: '2', mimeType: 'text/csv', filename: 'b.csv', body: { data: b64('inline') } },
        { partId: '3', mimeType: 'application/pdf', filename: 'c.pdf', body: {} },
      ],
    },
  };

  it('should re-resolve the attachment id from the part id and download it', async () => {
    const fetchSpy = spyOnFetch()
      .mockResolvedValueOnce(jsonResponse(message))
      .mockResolvedValueOnce(jsonResponse({ data: b64('%PDF') }));
    const bytes = await provider.getAttachment('at', 'm1', '1');
    expect(bytes.toString('utf8')).toBe('%PDF');
    expect(urlAt(fetchSpy, 1)).toBe(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/m1/attachments/att-fresh',
    );
  });

  it('should return inline part data without a second request', async () => {
    spyOnFetch().mockResolvedValueOnce(jsonResponse(message));
    await expect(provider.getAttachment('at', 'm1', '2')).resolves.toEqual(Buffer.from('inline'));
  });

  it('should throw ProviderNotFoundError for an unknown or empty part', async () => {
    spyOnFetch().mockResolvedValueOnce(jsonResponse(message));
    await expect(provider.getAttachment('at', 'm1', '9')).rejects.toBeInstanceOf(
      ProviderNotFoundError,
    );
    spyOnFetch().mockResolvedValueOnce(jsonResponse(message));
    await expect(provider.getAttachment('at', 'm1', '3')).rejects.toBeInstanceOf(
      ProviderNotFoundError,
    );
  });
});
