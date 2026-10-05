/** How a card face is drawn. Each colour pairing keeps its text readable (WCAG AA). */
export interface CardDesign {
  /** The bank's code ('HDFC'), whose name is in the cards locale (banks.HDFC); null when unknown. */
  readonly bankCode: string | null;
  /** A CSS background: a bank's gradient, or a product's own colour. */
  readonly background: string;
  /** Text and marks on the face: light on dark designs, dark on light ones. */
  readonly ink: 'light' | 'dark';
}

interface BankBrand {
  readonly from: string;
  readonly to: string;
}

/** A card product the bank prints in its own colours rather than the bank's. */
interface ProductDesign {
  readonly bank: string;
  /** Matched against the card's name from the statement email ('Pixel Play'). */
  readonly cardName: RegExp;
  readonly background: string;
  readonly ink: CardDesign['ink'];
}

const BANKS: Readonly<Record<string, BankBrand>> = {
  HDFC: { from: '#004C8F', to: '#0A2A55' },
  ICICI: { from: '#B02A30', to: '#6E1A1E' },
  SBI: { from: '#22409A', to: '#0E5E8F' },
  SBI_CARD: { from: '#1E3C78', to: '#0E6BA8' },
  AXIS: { from: '#97144D', to: '#5C0A2F' },
  KOTAK: { from: '#C8102E', to: '#003874' },
  FEDERAL: { from: '#0F3D7A', to: '#1B5FAA' },
};

/** Full names a hand-added card may use, mapped to the bank's code. */
const BANK_ALIASES: Readonly<Record<string, string>> = {
  STATE_BANK_OF_INDIA: 'SBI',
  KOTAK_MAHINDRA: 'KOTAK',
};

const PRODUCTS: readonly ProductDesign[] = [
  // Pixel Play and Pixel Go are printed lime yellow with dark text.
  { bank: 'HDFC', cardName: /\bpixel\b/i, background: '#DCE11E', ink: 'dark' },
  // Coral: a glowing orange-red sphere on the left fading into black.
  {
    bank: 'ICICI',
    cardName: /\bcoral\b/i,
    background:
      'radial-gradient(circle at 18% 45%, #D24A22 0%, #A8321A 28%, #4A120A 55%, #0E0E0E 85%)',
    ink: 'light',
  },
  // Scapia (Federal Bank): a dark band holding the names over a coral body.
  {
    bank: 'FEDERAL',
    cardName: /\bscapia\b/i,
    background: 'linear-gradient(180deg, #1C1F2A 0 26%, #D9472A 26% 100%)',
    ink: 'light',
  },
  // OneCard (Federal Bank): charcoal with a pure-black strip on the right. Its emails name it 'One'.
  {
    bank: 'FEDERAL',
    cardName: /^one(\s?card)?$/i,
    background: 'linear-gradient(90deg, #222222 0 72%, #050505 72% 100%)',
    ink: 'light',
  },
  // Flipkart (Axis Bank): black with a blue-to-magenta ribbon across it.
  {
    bank: 'AXIS',
    cardName: /\bflipkart\b/i,
    background:
      'radial-gradient(ellipse 42% 28% at 28% 58%, rgba(60, 125, 225, 0.85), transparent 70%), ' +
      'radial-gradient(ellipse 38% 28% at 72% 52%, rgba(185, 40, 120, 0.85), transparent 70%), ' +
      '#0A0A0A',
    ink: 'light',
  },
  // Zen (Kotak): dark bronze with a glowing orange infinity loop.
  {
    bank: 'KOTAK',
    cardName: /\bzen\b/i,
    background:
      'radial-gradient(ellipse 18% 32% at 56% 50%, transparent 72%, rgba(255, 150, 40, 0.75) 80%, transparent 88%), ' +
      'radial-gradient(ellipse 18% 32% at 80% 50%, transparent 72%, rgba(255, 170, 60, 0.65) 80%, transparent 88%), ' +
      'linear-gradient(135deg, #3A2414 0%, #120A06 70%)',
    ink: 'light',
  },
  // Sapphiro (ICICI): a faceted sapphire on the left fading into black.
  {
    bank: 'ICICI',
    cardName: /\bsapphiro\b/i,
    background:
      'linear-gradient(135deg, rgba(255, 255, 255, 0.14) 0 16%, transparent 16% 34%, ' +
      'rgba(255, 255, 255, 0.07) 34% 40%, transparent 40%), ' +
      'linear-gradient(100deg, #1F47C8 0%, #14329E 32%, #0A1A5C 58%, #02040C 85%)',
    ink: 'light',
  },
  // Amazon Pay: brushed black metal.
  {
    bank: 'ICICI',
    cardName: /\bamazon\b/i,
    background:
      'repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 3px), ' +
      'linear-gradient(135deg, #2E2E2E 0%, #0D0D0D 100%)',
    ink: 'light',
  },
];

/** Slate, for a bank with no brand entry yet. */
const NEUTRAL = { from: '#37474F', to: '#1C262B' };

const gradient = (from: string, to: string): string =>
  `linear-gradient(135deg, ${from} 0%, ${to} 100%)`;

/**
 * Email cards name their bank by code ('HDFC', 'SBI_CARD'); cards added by hand use the name
 * ('HDFC Bank', 'SBI Card', 'Kotak Mahindra Bank Ltd'). All resolve to the same code.
 */
const bankCode = (issuingBank: string): string => {
  const key = issuingBank
    .trim()
    .toUpperCase()
    .replace(/\.$/, '')
    .replace(/\s+(LTD|LIMITED)$/, '')
    .replace(/\s+BANK$/, '')
    .replace(/[\s-]+/g, '_');
  return BANK_ALIASES[key] ?? key;
};

/** The card's face: its product's own design when known, else its bank's, else a neutral one. */
export const cardDesign = (issuingBank: string, cardName: string | null): CardDesign => {
  const code = bankCode(issuingBank);
  const bank = BANKS[code];
  const known = bank ? code : null;
  const product = PRODUCTS.find(
    (design) => design.bank === code && cardName !== null && design.cardName.test(cardName),
  );
  if (product) return { bankCode: known, background: product.background, ink: product.ink };
  const { from, to } = bank ?? NEUTRAL;
  return { bankCode: known, background: gradient(from, to), ink: 'light' };
};
