const PG_UNIQUE_VIOLATION = '23505';

/**
 * Returns the first row of a query that must produce one (e.g. INSERT ... RETURNING).
 * An empty result is a server fault, so this throws a plain Error that maps to a 500.
 */
export const firstRowOrThrow = <T>(rows: readonly T[], context: string): T => {
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`${context}: expected a row but the query returned none`);
  }
  return row;
};

/** True when `err` is a Postgres unique violation. */
export const isUniqueViolation = (err: unknown): boolean =>
  typeof err === 'object' &&
  err !== null &&
  (err as { code?: unknown }).code === PG_UNIQUE_VIOLATION;
