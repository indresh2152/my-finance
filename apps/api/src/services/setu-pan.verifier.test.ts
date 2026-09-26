const mockLogger = { warn: jest.fn(), error: jest.fn() };
jest.mock('pino', () => jest.fn(() => mockLogger));

import { SetuPanVerifier } from './setu-pan.verifier';

const BASE_URL = 'https://dg-sandbox.setu.co';
const CLIENT_ID = 'test-client-id';
const CLIENT_SECRET = 'test-client-secret';
const PRODUCT_INSTANCE_ID = 'test-product-instance-id';
const PAN = 'ABCDE1234F';

const makeVerifier = (): SetuPanVerifier =>
  new SetuPanVerifier(BASE_URL, CLIENT_ID, CLIENT_SECRET, PRODUCT_INSTANCE_ID);

const mockFetch = (body: unknown, status = 200): void => {
  jest.spyOn(global, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
};

afterEach(() => {
  jest.restoreAllMocks();
  mockLogger.warn.mockClear();
  mockLogger.error.mockClear();
});

describe('SetuPanVerifier.verify', () => {
  it('should return valid=true and holderName when Setu returns verification SUCCESS', async () => {
    mockFetch({
      verification: 'SUCCESS',
      message: 'PAN is valid.',
      data: { full_name: 'JOHN DOE', first_name: 'JOHN', last_name: 'DOE' },
      traceId: 't1',
    });
    const result = await makeVerifier().verify(PAN);
    expect(result.valid).toBe(true);
    expect(result.holderName).toBe('JOHN DOE');
    expect(result.status).toBe('SUCCESS');
  });

  it('should treat verification status case-insensitively', async () => {
    mockFetch({ verification: 'success', data: { full_name: 'JOHN DOE' }, traceId: 't1b' });
    const result = await makeVerifier().verify(PAN);
    expect(result.valid).toBe(true);
  });

  it('should return valid=false when Setu returns verification FAILED', async () => {
    mockFetch({ verification: 'FAILED', message: 'PAN is invalid.', traceId: 't2' });
    const result = await makeVerifier().verify(PAN);
    expect(result.valid).toBe(false);
    expect(result.holderName).toBeUndefined();
    expect(result.status).toBe('FAILED');
  });

  it('should throw PAN_KYC_UNAVAILABLE when Setu returns non-2xx HTTP', async () => {
    mockFetch({ message: 'Internal Server Error' }, 500);
    await expect(makeVerifier().verify(PAN)).rejects.toThrow(
      expect.objectContaining({ code: 'PAN_KYC_UNAVAILABLE' }),
    );
  });

  it('should throw PAN_KYC_UNAVAILABLE on network failure', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(makeVerifier().verify(PAN)).rejects.toThrow(
      expect.objectContaining({ code: 'PAN_KYC_UNAVAILABLE' }),
    );
  });

  it('should call Setu with correct URL, method, headers, and body', async () => {
    mockFetch({ verification: 'SUCCESS', data: { full_name: 'JOHN DOE' }, traceId: 't3' });
    await makeVerifier().verify(PAN);
    expect(global.fetch).toHaveBeenCalledWith(
      `${BASE_URL}/api/verify/pan`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-client-id': CLIENT_ID,
          'x-client-secret': CLIENT_SECRET,
          'x-product-instance-id': PRODUCT_INSTANCE_ID,
        }),
      }),
    );
    const init = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string) as Record<string, string>;
    expect(body['pan']).toBe(PAN);
    expect(body['consent']).toBe('Y');
    expect(body['reason']).toEqual(expect.stringMatching(/.+/));
  });

  it('should return the Setu message and traceId when verification fails', async () => {
    mockFetch({ verification: 'failed', message: 'PAN not found.', traceId: 'trace-404' });
    const result = await makeVerifier().verify(PAN);
    expect(result).toEqual({
      valid: false,
      holderName: undefined,
      status: 'FAILED',
      message: 'PAN not found.',
      traceId: 'trace-404',
    });
  });

  it('should log HTTP status and Setu traceId without the PAN when Setu returns non-2xx', async () => {
    mockFetch({ message: 'Unauthorized', traceId: 'trace-401' }, 401);
    await expect(makeVerifier().verify(PAN)).rejects.toThrow(
      expect.objectContaining({ code: 'PAN_KYC_UNAVAILABLE' }),
    );
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 401, traceId: 'trace-401' }),
      expect.any(String),
    );
    expect(JSON.stringify(mockLogger.warn.mock.calls)).not.toContain(PAN);
  });

  it('should still throw PAN_KYC_UNAVAILABLE when the non-2xx body is not JSON', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 }));
    await expect(makeVerifier().verify(PAN)).rejects.toThrow(
      expect.objectContaining({ code: 'PAN_KYC_UNAVAILABLE' }),
    );
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 502, traceId: undefined }),
      expect.any(String),
    );
  });

  it('should log the network error without the PAN when fetch fails', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(makeVerifier().verify(PAN)).rejects.toThrow(
      expect.objectContaining({ code: 'PAN_KYC_UNAVAILABLE' }),
    );
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(TypeError) }),
      expect.any(String),
    );
    expect(JSON.stringify(mockLogger.error.mock.calls)).not.toContain(PAN);
  });
});
