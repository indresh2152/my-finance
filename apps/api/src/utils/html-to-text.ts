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

/** Minimal HTML → text for bank emails. Not a sanitiser; output is never rendered as HTML. */
export const htmlToText = (html: string): string =>
  html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&[a-z]+;/gi, (entity) => NAMED_ENTITIES[entity.toLowerCase()] ?? ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
