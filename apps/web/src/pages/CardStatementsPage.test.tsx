import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { renderWithProviders } from '../test/renderWithProviders';
import { mailbox } from '../test/fixtures';
import { AuthProvider } from '../context/AuthContext';
import type { CardStatementHistory, CreditCard } from '../services/credit-cards.api';
import type { Mailbox } from '../services/mailbox.api';
import { CardStatementsPage } from './CardStatementsPage';

vi.mock('../services/navigation', () => ({ redirectTo: vi.fn() }));

/** jsdom cannot lay out SVG; the chart's own test covers what it shows. */
vi.mock('@mui/x-charts/LineChart', () => ({
  LineChart: (): React.ReactElement => <div data-testid="line-chart" />,
}));

const CARD_ID = 'card-1';
const STATEMENTS_URL = '/api/v1/credit-cards/:cardId/statements';
const DOWNLOAD_URL = '/api/v1/mailboxes/statements/:id/download';

const card: CreditCard = {
  id: CARD_ID,
  cardNumberLast4: '4242',
  cardName: 'Regalia',
  cardNetwork: 'VISA',
  issuingBank: 'HDFC Bank',
  cardVariant: 'PLATINUM',
  expiryMonth: null,
  expiryYear: null,
  nameOnCard: null,
  status: 'ACTIVE',
  creditLimit: null,
  availableCredit: null,
  currentBalance: null,
  latestStatement: null,
};

const history: CardStatementHistory = {
  card,
  statements: [
    {
      id: 'stmt-sep',
      statementDate: '2026-09-05',
      dueDate: '2026-09-25',
      totalAmountDue: 12345.67,
      minimumAmountDue: 620,
      passwordHint: null,
      downloadAvailable: true,
    },
    {
      id: 'stmt-aug',
      statementDate: '2026-08-05',
      dueDate: '2026-08-25',
      totalAmountDue: 8000,
      minimumAmountDue: null,
      passwordHint: null,
      downloadAvailable: true,
    },
  ],
};

let hasPan = true;
let mailboxes: Mailbox[] = [];
let requestedCardIds: string[] = [];
const server = setupServer(
  http.post('/api/v1/auth/refresh', () => HttpResponse.json({ accessToken: 'token' })),
  http.get('/api/v1/users/me', () =>
    HttpResponse.json({ id: '1', username: 'u', email: 'e@e.com', hasPan, panMasked: null }),
  ),
  http.get('/api/v1/mailboxes', () => HttpResponse.json({ mailboxes })),
  http.get(STATEMENTS_URL, ({ params }) => {
    requestedCardIds.push(String(params['cardId']));
    return HttpResponse.json(history);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  hasPan = true;
  mailboxes = [mailbox()];
  requestedCardIds = [];
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const renderPage = (cardId = CARD_ID): void => {
  renderWithProviders(
    <AuthProvider>
      <Routes>
        <Route path="/cards/:cardId" element={<CardStatementsPage />} />
        <Route path="/" element={<p>Dashboard home</p>} />
      </Routes>
    </AuthProvider>,
    { initialEntries: [`/cards/${cardId}`] },
  );
};

describe('CardStatementsPage', () => {
  it("should show the card, its chart and every statement from the card's ID", async () => {
    renderPage();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'HDFC Bank Regalia' }),
    ).toBeInTheDocument();
    expect(requestedCardIds).toEqual([CARD_ID]);
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: /^Sept? 2026$/ })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Aug 2026' })).toBeInTheDocument();
    expect(screen.queryByText(/12,345/)).not.toBeInTheDocument();
  });

  it('should show every amount with the show-all switch', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Show all amounts' }));
    expect(screen.getByText('₹12,345.67')).toBeInTheDocument();
    expect(screen.getByText('₹8,000.00')).toBeInTheDocument();
  });

  it("should download a month's statement", async () => {
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:1'), revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const downloaded: string[] = [];
    server.use(
      http.get(DOWNLOAD_URL, ({ params }) => {
        downloaded.push(String(params['id']));
        return new HttpResponse('%PDF-1.7', {
          headers: { 'Content-Disposition': 'attachment; filename="HDFC-Aug.pdf"' },
        });
      }),
    );
    renderPage();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Download Aug 2026 statement' }),
    );
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(downloaded).toEqual(['stmt-aug']);
    click.mockRestore();
  });

  it('should explain a failed download', async () => {
    server.use(http.get(DOWNLOAD_URL, () => new HttpResponse('oops', { status: 502 })));
    renderPage();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Download Aug 2026 statement' }),
    );
    expect(
      await screen.findByText("Couldn't download the statement. Please try again."),
    ).toBeInTheDocument();
  });

  it('should offer no download when mailbox features are off', async () => {
    let mailboxRequests = 0;
    server.use(
      http.get('/api/v1/mailboxes', () => {
        mailboxRequests += 1;
        return new HttpResponse(null, { status: 404 });
      }),
    );
    renderPage();
    await screen.findByRole('rowheader', { name: 'Aug 2026' });
    await waitFor(() => expect(mailboxRequests).toBe(1));
    expect(screen.queryByRole('button', { name: /^Download/ })).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Password hint for the Aug 2026 statement' }),
    ).toBeInTheDocument();
  });

  it("should report a card that isn't the user's as not found, without a retry", async () => {
    server.use(
      http.get(STATEMENTS_URL, () =>
        HttpResponse.json({ error: { code: 'CARD_NOT_FOUND', message: 'x' } }, { status: 404 }),
      ),
    );
    renderPage();
    expect(await screen.findByText(/We couldn't find this card/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('should offer a retry when loading fails', async () => {
    let failures = 1;
    server.use(
      http.get(STATEMENTS_URL, () => {
        if (failures-- > 0) return new HttpResponse(null, { status: 500 });
        return HttpResponse.json(history);
      }),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'HDFC Bank Regalia' }),
    ).toBeInTheDocument();
  });

  it('should go back to the dashboard', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('link', { name: 'Back to dashboard' }));
    expect(screen.getByText('Dashboard home')).toBeInTheDocument();
  });

  it('should ask a user without a PAN to link one, loading nothing', async () => {
    hasPan = false;
    renderPage();
    expect(await screen.findByText(/link your pan/i)).toBeInTheDocument();
    expect(requestedCardIds).toEqual([]);
  });
});
