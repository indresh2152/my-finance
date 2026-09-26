import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';
import { ApiDocsPage } from './ApiDocsPage';

describe('ApiDocsPage', () => {
  it('should embed the Swagger UI in a titled iframe', () => {
    renderWithProviders(<ApiDocsPage />);

    const frame = screen.getByTitle('API Docs');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame).toHaveAttribute('src', '/api/docs/');
  });
});
