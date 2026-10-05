const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&rsquo;': "'",
  '&lsquo;': "'",
};

const MAX_CODE_POINT = 0x10ffff;
const SURROGATES = { min: 0xd800, max: 0xdfff };

/**
 * One pass over named and numeric entities, so a decoded '&' never starts a second entity. NUL,
 * lone surrogates and out-of-range codes become a space: Postgres text rejects the first two, and
 * fromCodePoint throws on the last.
 */
const decodeEntity = (entity: string, hex?: string, decimal?: string): string => {
  if (hex === undefined && decimal === undefined) {
    return NAMED_ENTITIES[entity.toLowerCase()] ?? ' ';
  }
  const code = hex !== undefined ? parseInt(hex, 16) : Number(decimal);
  const unsafe =
    code === 0 || code > MAX_CODE_POINT || (code >= SURROGATES.min && code <= SURROGATES.max);
  return unsafe ? ' ' : String.fromCodePoint(code);
};

/** Minimal HTML → text for bank emails. Not a sanitiser; output is never rendered as HTML. */
export const htmlToText = (html: string): string =>
  html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:#x([0-9a-f]+)|#(\d+)|[a-z]+);/gi, decodeEntity)
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
