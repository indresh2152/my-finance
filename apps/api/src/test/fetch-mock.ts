export type FetchSpy = jest.SpyInstance<Promise<Response>, Parameters<typeof fetch>>;

/** Builds a `Response` whose JSON body is `body`, defaulting to a 200 status. */
export const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Spies on the global `fetch`, restored by the caller's `afterEach(() => jest.restoreAllMocks())`. */
export const spyOnFetch = (): FetchSpy => jest.spyOn(global, 'fetch');

/** Returns the recorded fetch call at `index`, throwing (rather than asserting with `!`) when missing. */
export const callAt = (spy: FetchSpy, index: number): Parameters<typeof fetch> => {
  const call = spy.mock.calls[index];
  if (!call) throw new Error(`fetch call ${index} was not recorded`);
  return call;
};

/** Returns the `RequestInit` passed to the fetch call at `index`, throwing when it was not recorded. */
export const initAt = (spy: FetchSpy, index: number): RequestInit => {
  const init = callAt(spy, index)[1];
  if (!init) throw new Error(`fetch call ${index} had no init`);
  return init;
};

/** Returns the URL passed to the fetch call at `index`, as a string. */
export const urlAt = (spy: FetchSpy, index: number): string => String(callAt(spy, index)[0]);
