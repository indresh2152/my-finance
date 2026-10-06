import { useContext, useState } from 'react';
import { AmountVisibilityContext } from '../context/AmountVisibilityContext';

export interface AmountReveal {
  readonly isRevealed: boolean;
  readonly toggle: () => void;
}

/**
 * Hidden by default. Follows the page's show-all switch whenever it flips, and can still be
 * toggled on its own afterwards.
 */
export const useAmountReveal = (): AmountReveal => {
  const showAll = useContext(AmountVisibilityContext);
  const [isRevealed, setRevealed] = useState(showAll);
  const [followedShowAll, setFollowedShowAll] = useState(showAll);
  // Adjusting state during render (not in an effect) avoids a frame showing the old state.
  if (followedShowAll !== showAll) {
    setFollowedShowAll(showAll);
    setRevealed(showAll);
  }
  return { isRevealed, toggle: () => setRevealed((revealed) => !revealed) };
};
