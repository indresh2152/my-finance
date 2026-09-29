export interface Deferred {
  promise: Promise<void>;
  release: () => void;
}

/** A promise the test resolves by hand, to hold a mocked response open. */
export const deferred = (): Deferred => {
  let release = (): void => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

/** Waits long enough that a request which should be held back would have been sent. */
export const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 50));
