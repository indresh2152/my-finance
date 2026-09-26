import { postTokenForm, getJson } from './provider-http';
import { ReauthRequiredError, ProviderRequestError, ProviderNotFoundError } from './mail-provider';
import { jsonResponse, initAt, spyOnFetch } from '../../../test/fetch-mock';

afterEach(() => jest.restoreAllMocks());

describe('postTokenForm', () => {
  it('should POST form-encoded params and return the token body', async () => {
    const fetchSpy = spyOnFetch().mockResolvedValueOnce(jsonResponse({ access_token: 'at' }));
    const body = await postTokenForm('GOOGLE', 'https://token', { grant_type: 'refresh_token' });
    expect(body.access_token).toBe('at');
    const init = initAt(fetchSpy, 0);
    expect(init.method).toBe('POST');
    expect((init.body as URLSearchParams).get('grant_type')).toBe('refresh_token');
  });

  it('should throw ReauthRequiredError on invalid_grant', async () => {
    spyOnFetch().mockResolvedValueOnce(jsonResponse({ error: 'invalid_grant' }, 400));
    await expect(postTokenForm('MICROSOFT', 'https://token', {})).rejects.toBeInstanceOf(
      ReauthRequiredError,
    );
  });

  it('should throw ProviderRequestError on other errors', async () => {
    spyOnFetch().mockResolvedValueOnce(jsonResponse({ error: 'server_error' }, 500));
    await expect(postTokenForm('GOOGLE', 'https://token', {})).rejects.toMatchObject({
      name: 'ProviderRequestError',
      status: 500,
      reason: 'server_error',
    });
  });

  it('should throw ProviderRequestError when access_token is missing', async () => {
    spyOnFetch().mockResolvedValueOnce(jsonResponse({}));
    await expect(postTokenForm('GOOGLE', 'https://token', {})).rejects.toBeInstanceOf(
      ProviderRequestError,
    );
  });

  it('should handle a non-JSON error body', async () => {
    spyOnFetch().mockResolvedValueOnce(new Response('oops', { status: 502 }));
    await expect(postTokenForm('GOOGLE', 'https://token', {})).rejects.toMatchObject({
      reason: 'token_request_failed',
    });
  });
});

describe('getJson', () => {
  it('should send the bearer token and return parsed JSON', async () => {
    const fetchSpy = spyOnFetch().mockResolvedValueOnce(jsonResponse({ ok: true }));
    await expect(getJson('GOOGLE', 'https://api/x', 'at', { Prefer: 'p' })).resolves.toEqual({
      ok: true,
    });
    const headers = initAt(fetchSpy, 0).headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer at');
    expect(headers['Prefer']).toBe('p');
  });

  it('should throw ProviderNotFoundError on 404', async () => {
    spyOnFetch().mockResolvedValueOnce(jsonResponse({}, 404));
    await expect(getJson('GOOGLE', 'https://api/x', 'at')).rejects.toBeInstanceOf(
      ProviderNotFoundError,
    );
  });

  it('should throw ProviderRequestError on other failures', async () => {
    spyOnFetch().mockResolvedValueOnce(jsonResponse({}, 503));
    await expect(getJson('MICROSOFT', 'https://api/x', 'at')).rejects.toMatchObject({
      status: 503,
    });
  });
});
