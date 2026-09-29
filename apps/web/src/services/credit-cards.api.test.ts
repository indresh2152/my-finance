import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { vi } from 'vitest';
import { apiErrorCode } from './api';
import { downloadStatement } from './credit-cards.api';

/** jsdom's Blob has no text(). */
const readBlobText = (blob: Blob): Promise<string> =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (): void => resolve(String(reader.result));
    reader.readAsText(blob);
  });

vi.mock('./navigation', () => ({ redirectTo: vi.fn() }));

const DOWNLOAD_URL = '/api/v1/mailboxes/statements/:id/download';
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('downloadStatement', () => {
  it('should return the file and its name', async () => {
    server.use(
      http.get(
        DOWNLOAD_URL,
        () =>
          new HttpResponse('%PDF-1.7', {
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': 'attachment; filename="HDFC.pdf"',
            },
          }),
      ),
    );
    const file = await downloadStatement('stmt-1');
    expect(file.filename).toBe('HDFC.pdf');
    expect(await readBlobText(file.blob)).toBe('%PDF-1.7');
  });

  it('should expose the API error code even though the body was requested as a blob', async () => {
    server.use(
      http.get(DOWNLOAD_URL, () =>
        HttpResponse.json(
          { error: { code: 'STATEMENT_UNAVAILABLE', message: 'gone' } },
          { status: 404 },
        ),
      ),
    );
    const err: unknown = await downloadStatement('stmt-1').catch((e: unknown) => e);
    expect(apiErrorCode(err)).toBe('STATEMENT_UNAVAILABLE');
  });

  it('should leave a non-JSON error body alone', async () => {
    server.use(http.get(DOWNLOAD_URL, () => new HttpResponse('bad gateway', { status: 502 })));
    const err: unknown = await downloadStatement('stmt-1').catch((e: unknown) => e);
    expect(apiErrorCode(err)).toBeNull();
  });
});
