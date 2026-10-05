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

/** Parsers read only the start of a body; this bounds the conversion work on a huge HTML part. */
const MAX_HTML_CHARS = 1_000_000;

/**
 * Email text as the field readers expect it, whatever the source (HTML or a plain part): '\n' line
 * breaks, non-breaking spaces ('₹&#160;2,427.31') as spaces, runs of blanks and blank lines collapsed.
 */
export const normaliseText = (text: string): string =>
  text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\u00A0\u202F]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();

const BLOCK_START = /<(script|style)\b/gi;
const BLOCK_END: Readonly<Record<string, RegExp>> = { script: /<\/script/gi, style: /<\/style/gi };

/**
 * Drops <script> and <style> blocks in one forward scan; an unclosed block runs to the end. A lazy
 * regex would rescan to the end for every opening tag: quadratic on hostile HTML.
 */
const removeBlocks = (html: string): string => {
  const kept: string[] = [];
  let cursor = 0;
  BLOCK_START.lastIndex = 0;
  for (let match = BLOCK_START.exec(html); match; match = BLOCK_START.exec(html)) {
    kept.push(html.slice(cursor, match.index), ' ');
    const blockEnd = BLOCK_END[(match[1] ?? '').toLowerCase()];
    if (blockEnd) blockEnd.lastIndex = match.index;
    const close = blockEnd?.exec(html)?.index ?? -1;
    const end = close === -1 ? -1 : html.indexOf('>', close);
    cursor = end === -1 ? html.length : end + 1;
    BLOCK_START.lastIndex = cursor;
  }
  kept.push(html.slice(cursor));
  return kept.join('');
};

/**
 * Minimal HTML → text for bank emails. Not a sanitiser; output is never rendered as HTML. Every
 * step is linear: a tag ends at the next '>' or '<', so an unclosed '<' never rescans the input.
 */
export const htmlToText = (html: string): string =>
  normaliseText(
    removeBlocks(html.slice(0, MAX_HTML_CHARS))
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, '\n')
      .replace(/<[^<>]*>/g, ' ')
      .replace(/&(?:#x([0-9a-f]+)|#(\d+)|[a-z]+);/gi, decodeEntity),
  );
