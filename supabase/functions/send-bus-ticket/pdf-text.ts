/**
 * Text that pdf-lib's standard fonts can actually draw.
 *
 * The built-in Helvetica is WinAnsi (CP1252), and `drawText` THROWS on any
 * character outside it. Every route on the platform is named
 * "Origine → Destination", so the arrow alone made **every** ticket PDF fail —
 * found the first time this ran against a real booking rather than a fixture.
 *
 * Embedding a Unicode font would need fontkit and a megabyte of TTF in the
 * function bundle; a boarding pass needs neither. The arrows and typographic
 * marks that actually turn up are mapped to CP1252 equivalents, French accents
 * pass through untouched (they are all in CP1252), and anything else a company
 * types into a route name — an emoji, a Cyrillic letter — is dropped rather
 * than allowed to throw. A ticket that prints with one character missing beats
 * a ticket that does not print.
 *
 * It lives in its own file so `src/lib/__tests__/pdf-text.test.ts` can import
 * the real thing. A test against a copy of this logic would have passed while
 * the deployed function still threw.
 */

/** The 27 characters CP1252 adds above U+00FF. */
const CP1252_EXTRAS = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160,
  0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

const SUBSTITUTIONS: Record<string, string> = {
  "→": "-", "←": "-", "↔": "-", "⟶": "-", "➔": "-", "»": "»", "✓": "", "✔": "",
  " ": " ", " ": " ", " ": " ",
};

export const pdfText = (s: string): string =>
  [...(s ?? "")]
    .map(ch => {
      if (ch in SUBSTITUTIONS) return SUBSTITUTIONS[ch];
      const code = ch.codePointAt(0)!;
      if (code < 0x100 || CP1252_EXTRAS.has(code)) return ch;
      return "";
    })
    .join("");
