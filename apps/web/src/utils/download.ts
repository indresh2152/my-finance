const DEFAULT_FILENAME = 'download';
const ENCODED_FILENAME = /filename\*=UTF-8''([^;]+)/i;
/** A quoted-string: backslash escapes any character, e.g. filename="Statement \\"Sep\\".pdf". */
const QUOTED_FILENAME = /filename="((?:[^"\\]|\\.)+)"/i;
const QUOTED_PAIR = /\\(.)/g;

/** The filename from a Content-Disposition header, preferring the RFC 5987 UTF-8 form. */
export const filenameFromDisposition = (header: string | undefined): string => {
  if (!header) return DEFAULT_FILENAME;
  const encoded = ENCODED_FILENAME.exec(header)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      // Malformed encoding: fall back to the plain filename.
    }
  }
  return QUOTED_FILENAME.exec(header)?.[1]?.replace(QUOTED_PAIR, '$1') ?? DEFAULT_FILENAME;
};

/** Long enough for browsers that start blob downloads asynchronously (Safari) to read the file. */
const REVOKE_DELAY_MS = 10_000;

/** Hands the browser a file to save, via a temporary object URL released shortly afterwards. */
export const saveFile = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
};
