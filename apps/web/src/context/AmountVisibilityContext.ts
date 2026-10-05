import { createContext } from 'react';

/**
 * True while the page asks for every masked amount to be shown. Each MaskedAmount follows it when
 * it changes and can still be toggled on its own afterwards. Defaults to hidden.
 */
export const AmountVisibilityContext = createContext(false);
