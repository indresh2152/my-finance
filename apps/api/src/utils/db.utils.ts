const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';
/** SQLSTATE classes 22 (data exception) and 23 (integrity constraint violation). */
const PG_BAD_DATA_CLASSES: readonly string[] = ['22', '23'];
const SQLSTATE_CLASS_LENGTH = 2;
/** A SQLSTATE is five digits or upper-case letters and carries no row data. */
const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/;

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

/** The error's Postgres SQLSTATE, or null when it has none (Node codes such as ECONNRESET are not SQLSTATEs). */
export const pgErrorCode = (err: unknown): string | null => {
  const code: unknown = typeof err === 'object' && err !== null ? Reflect.get(err, 'code') : null;
  return typeof code === 'string' && SQLSTATE_PATTERN.test(code) ? code : null;
};

/**
 * True when Postgres rejected the values themselves (class 22 or 23), so retrying cannot help.
 * A foreign-key violation (23503) is excluded: it points at a missing parent row, not bad input.
 */
export const isBadDataError = (err: unknown): boolean => {
  const code = pgErrorCode(err);
  return (
    code !== null &&
    code !== PG_FOREIGN_KEY_VIOLATION &&
    PG_BAD_DATA_CLASSES.includes(code.slice(0, SQLSTATE_CLASS_LENGTH))
  );
};
