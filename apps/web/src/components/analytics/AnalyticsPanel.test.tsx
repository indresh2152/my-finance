import React from 'react';
import { screen } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { vi } from 'vitest';
import { renderWithProviders } from '../../test/renderWithProviders';
import { AmountVisibilityContext } from '../../context/AmountVisibilityContext';
import type { CreditCard, CardStatement } from '../../services/credit-cards.api';
import { AnalyticsPanel } from './AnalyticsPanel';

interface ChartProps {
  series: {
    label: string;
    data: (number | null)[];
    valueFormatter: (v: number | null) => string;
  }[];
}

/** jsdom cannot lay out SVG, so the chart prints each line's label and its latest amount. */
vi.mock('@mui/x-charts/LineChart', () => ({
  LineChart: ({ series }: ChartProps): React.ReactElement => (
    <ul>
      {series.map((line) => (
        <li key={line.label}>
          {line.label}: {line.valueFormatter(line.data.find((v) => v !== null) ?? null)}
        </li>
      ))}
    </ul>
  ),
}));

const card = (id: string, issuingBank: string, last4: string, mailboxId: string): CreditCard => ({
  id,
  cardNumberLast4: last4,
  cardName: null,
  cardNetwork: null,
  issuingBank,
  cardVariant: 'PLATINUM',
  expiryMonth: null,
  expiryYear: null,
  nameOnCard: null,
  status: 'ACTIVE',
  creditLimit: null,
  availableCredit: null,
  currentBalance: null,
  latestStatement: null,
  mailboxIds: [mailboxId],
});

const statement = (id: string, totalAmountDue: number): CardStatement => ({
  id,
  statementDate: new Date().toISOString().slice(0, 10),
  dueDate: null,
  totalAmountDue,
  minimumAmountDue: null,
  passwordHint: null,
  downloadAvailable: true,
});

let cards: CreditCard[] = [];
let statementsByCard: Record<string, CardStatement[]> = {};
let failCards = false;
let failStatementsFor: string | null = null;
const server = setupServer(
  http.get('/api/v1/credit-cards', () =>
    failCards ? new HttpResponse(null, { status: 500 }) : HttpResponse.json({ cards }),
  ),
  http.get('/api/v1/credit-cards/:id/statements', ({ params }) => {
    const id = String(params['id']);
    if (id === failStatementsFor) return new HttpResponse(null, { status: 500 });
    const found = cards.find((c) => c.id === id);
    return HttpResponse.json({ card: found, statements: statementsByCard[id] ?? [] });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  cards = [card('c1', 'HDFC Bank', '4242', 'mb-1'), card('c2', 'ICICI Bank', '9876', 'mb-2')];
  statementsByCard = { c1: [statement('s1', 1000)], c2: [statement('s2', 2000)] };
  failCards = false;
  failStatementsFor = null;
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const renderPanel = (mailboxFilter = 'all', showAll = true): void => {
  renderWithProviders(
    <AmountVisibilityContext.Provider value={showAll}>
      <AnalyticsPanel mailboxFilter={mailboxFilter} />
    </AmountVisibilityContext.Provider>,
  );
};

describe('AnalyticsPanel', () => {
  it('should draw one line per card', async () => {
    renderPanel();
    expect(await screen.findByText('HDFC Bank •••• 4242: ₹1,000.00')).toBeInTheDocument();
    expect(screen.getByText('ICICI Bank •••• 9876: ₹2,000.00')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Amount due per card, last 12 months' }),
    ).toBeInTheDocument();
  });

  it('should list every card in a legend under the chart', async () => {
    renderPanel();
    expect(await screen.findByText('HDFC Bank •••• 4242')).toBeInTheDocument();
    expect(screen.getByText('ICICI Bank •••• 9876')).toBeInTheDocument();
  });

  it('should keep amounts masked until revealed', async () => {
    renderPanel('all', false);
    expect(await screen.findByText('HDFC Bank •••• 4242: ₹ ••••••')).toBeInTheDocument();
    expect(screen.queryByText(/1,000/)).not.toBeInTheDocument();
  });

  it('should chart only the cards found in the chosen email', async () => {
    renderPanel('mb-2');
    expect(await screen.findByText('ICICI Bank •••• 9876: ₹2,000.00')).toBeInTheDocument();
    expect(screen.queryByText(/4242/)).not.toBeInTheDocument();
  });

  it('should leave out a card with no statements', async () => {
    statementsByCard = { c1: [], c2: [statement('s2', 2000)] };
    renderPanel();
    expect(await screen.findByText('ICICI Bank •••• 9876')).toBeInTheDocument();
    expect(screen.queryByText(/4242/)).not.toBeInTheDocument();
  });

  it('should say when no card has statements', async () => {
    statementsByCard = {};
    renderPanel();
    expect(await screen.findByText('No statements found in the last 12 months.')).toBeVisible();
  });

  it('should say when the chosen email has no statements', async () => {
    renderPanel('mb-9');
    expect(await screen.findByText(/in this email in the last 12 months/)).toBeVisible();
  });

  it('should report a failure to load the cards', async () => {
    failCards = true;
    renderPanel();
    expect(await screen.findByText(/Failed to load the statement history/)).toBeVisible();
  });

  it('should still chart the cards that loaded when one history fails', async () => {
    failStatementsFor = 'c2';
    renderPanel();
    expect(await screen.findByText('HDFC Bank •••• 4242: ₹1,000.00')).toBeInTheDocument();
    expect(screen.getByText(/Couldn't load the statements of 1 card/)).toBeVisible();
  });

  it('should report a failure when every history fails', async () => {
    cards = [cards[0] as CreditCard];
    failStatementsFor = 'c1';
    renderPanel();
    expect(await screen.findByText(/Failed to load the statement history/)).toBeVisible();
  });

  it('should tell apart cards with the same label', async () => {
    cards = [card('c1', 'HDFC Bank', '4242', 'mb-1'), card('c2', 'HDFC Bank', '4242', 'mb-1')];
    statementsByCard = { c1: [statement('s1', 1000)], c2: [statement('s2', 2000)] };
    renderPanel();
    expect(await screen.findByText('HDFC Bank •••• 4242 (1)')).toBeInTheDocument();
    expect(screen.getByText('HDFC Bank •••• 4242 (2)')).toBeInTheDocument();
  });
});
