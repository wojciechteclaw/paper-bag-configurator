import { PANTONE_CODE_MAX_LENGTH } from '../config/productCatalog';
import { pantoneLookupKey } from '../printColors';
import type { PantoneColor } from '../types';

export type PantoneError = 'EMPTY' | 'TOO_LONG' | 'DUPLICATE' | 'LIMIT_REACHED' | 'INVALID_HEX';

/** Trims and collapses whitespace: "  PMS   186 C " → "PMS 186 C". */
export function normalizePantoneCode(code: string): string {
  return code.trim().replace(/\s+/g, ' ');
}

/**
 * Validates a Pantone entry about to be added to `colors`. Codes are compared by `pantoneLookupKey` (case, spacing and
 * the PMS / PANTONE prefix ignored), so "PANTONE 186 C" duplicates "PMS 186 C".
 */
export function validatePantoneColorToAdd(
  colors: readonly PantoneColor[],
  code: string,
  maxColors: number,
): PantoneError | null {
  const normalized = normalizePantoneCode(code);
  if (normalized === '') return 'EMPTY';
  if (normalized.length > PANTONE_CODE_MAX_LENGTH) return 'TOO_LONG';
  // A listed colour is reported as such even when the list is full.
  const key = pantoneLookupKey(normalized);
  if (colors.some((c) => pantoneLookupKey(c.code) === key)) return 'DUPLICATE';
  if (colors.length >= maxColors) return 'LIMIT_REACHED';
  return null;
}
