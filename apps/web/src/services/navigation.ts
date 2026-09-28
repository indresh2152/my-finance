/** Full-page navigation (OAuth redirects). Wrapped so tests can mock it. */
export const redirectTo = (url: string): void => {
  window.location.assign(url);
};
