import { vi } from 'vitest';
import { redirectTo } from './navigation';

const TARGET_URL = 'https://accounts.example/auth';

describe('redirectTo', () => {
  const originalLocation = window.location;

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('should navigate the whole page to the given URL', () => {
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, assign },
    });

    redirectTo(TARGET_URL);

    expect(assign).toHaveBeenCalledWith(TARGET_URL);
  });
});
