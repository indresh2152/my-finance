import { render, type RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@mui/material/styles';
import { I18nextProvider } from 'react-i18next';
import { theme } from '../theme';
import i18n from '../i18n';

interface RenderOptions {
  initialEntries?: string[];
}

export const renderWithProviders = (
  ui: React.ReactElement,
  { initialEntries = ['/'] }: RenderOptions = {},
): RenderResult => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>
          <ThemeProvider theme={theme}>{ui}</ThemeProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
};
