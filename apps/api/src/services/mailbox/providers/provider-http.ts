import {
  ProviderNotFoundError,
  ProviderRequestError,
  ReauthRequiredError,
  type ProviderKey,
} from './mail-provider';

const HTTP_NOT_FOUND = 404;
const INVALID_GRANT = 'invalid_grant';
const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded';

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
}

interface RawTokenResponse {
  access_token?: string;
  refresh_token?: string;
  error?: string;
}

export const postTokenForm = async (
  provider: ProviderKey,
  url: string,
  params: Record<string, string>,
): Promise<TokenResponse> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': FORM_CONTENT_TYPE, Accept: 'application/json' },
    body: new URLSearchParams(params),
  });
  const body = (await response.json().catch(() => ({}) as RawTokenResponse)) as RawTokenResponse;

  if (!response.ok) {
    if (body.error === INVALID_GRANT) {
      throw new ReauthRequiredError(provider);
    }
    throw new ProviderRequestError(provider, response.status, body.error ?? 'token_request_failed');
  }
  if (!body.access_token) {
    throw new ProviderRequestError(provider, response.status, 'missing_access_token');
  }
  return { access_token: body.access_token, refresh_token: body.refresh_token };
};

export const getJson = async <T>(
  provider: ProviderKey,
  url: string,
  accessToken: string,
  headers: Record<string, string> = {},
): Promise<T> => {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', ...headers },
  });
  if (response.status === HTTP_NOT_FOUND) {
    throw new ProviderNotFoundError(provider);
  }
  if (!response.ok) {
    throw new ProviderRequestError(provider, response.status, 'request_failed');
  }
  return (await response.json()) as T;
};
