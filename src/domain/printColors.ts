// Print colours (Pantone + preview colour) helpers. Pure TS.

import { PANTONE_FALLBACK_PREVIEW_COLORS, PANTONE_PREVIEW_SUGGESTIONS } from './config/productCatalog';
import { normalizeHex } from './printCoverage/color';

/** "pms  186 c" / "Pantone 186 C" → "186 C" — the key of `PANTONE_PREVIEW_SUGGESTIONS`. */
export function pantoneLookupKey(code: string): string {
  return code
    .trim()
    .toUpperCase()
    .replace(/^(PMS|PANTONE)\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Suggested preview colour for a new Pantone entry: a known approximation of the code when available, otherwise
 * the first fallback colour not already used (`usedHexes`), otherwise the first fallback colour.
 */
export function suggestPantonePreviewHex(code: string, usedHexes: readonly string[] = []): string {
  const known = PANTONE_PREVIEW_SUGGESTIONS[pantoneLookupKey(code)];
  if (known) return known;
  const used = new Set(usedHexes.map((hex) => normalizeHex(hex)));
  return PANTONE_FALLBACK_PREVIEW_COLORS.find((hex) => !used.has(hex)) ?? PANTONE_FALLBACK_PREVIEW_COLORS[0];
}
