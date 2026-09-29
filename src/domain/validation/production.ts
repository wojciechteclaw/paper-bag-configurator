import { PANTONE_CODE_MAX_LENGTH } from '../config/productCatalog';
import type { PantoneColor } from '../types';

export type PantoneError = 'EMPTY' | 'TOO_LONG' | 'DUPLICATE' | 'LIMIT_REACHED' | 'INVALID_HEX';

/** Trims and collapses whitespace: "  PMS   186 C " → "PMS 186 C". */
export function normalizePantoneCode(code: string): string {
  return code.trim().replace(/\s+/g, ' ');
}

/** Validates a Pantone entry about to be added to `colors` (codes compared case-insensitively). */
export function validatePantoneColorToAdd(
  colors: readonly PantoneColor[],
  code: string,
  maxColors: number,
): PantoneError | null {
  const normalized = normalizePantoneCode(code);
  if (normalized === '') return 'EMPTY';
  if (normalized.length > PANTONE_CODE_MAX_LENGTH) return 'TOO_LONG';
  if (colors.length >= maxColors) return 'LIMIT_REACHED';
  if (colors.some((c) => c.code.toLowerCase() === normalized.toLowerCase())) return 'DUPLICATE';
  return null;
}
