type EnvOverrides = Record<string, string | undefined>;

const applyEnv = (vars: EnvOverrides): void => {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else process.env[key] = value;
  }
};

/**
 * Wraps a test body so the given env vars (undefined = unset) apply only for
 * its duration; the previous values are restored even if the body throws.
 */
export const withEnv =
  (vars: EnvOverrides, fn: () => Promise<void>): (() => Promise<void>) =>
  async (): Promise<void> => {
    const previous = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
    applyEnv(vars);
    try {
      await fn();
    } finally {
      applyEnv(previous);
    }
  };
