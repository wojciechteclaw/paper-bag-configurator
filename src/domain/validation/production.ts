import { PANTONE_CODE_MAX_LENGTH } from '../config/productCatalog';

export type PantoneError = 'EMPTY' | 'TOO_LONG' | 'DUPLICATE' | 'LIMIT_REACHED';

export type QuantityError = 'NOT_A_NUMBER' | 'NOT_INTEGER' | 'BELOW_MIN';

/** Trims and collapses whitespace: "  PMS   186 C " → "PMS 186 C". */
export function normalizePantoneCode(code: string): string {
  return code.trim().replace(/\s+/g, ' ');
}

/** Validates a Pantone entry about to be added to `colors` (compared case-insensitively). */
export function validatePantoneColorToAdd(colors: string[], code: string, maxColors: number): PantoneError | null {
  const normalized = normalizePantoneCode(code);
  if (normalized === '') return 'EMPTY';
  if (normalized.length > PANTONE_CODE_MAX_LENGTH) return 'TOO_LONG';
  if (colors.length >= maxColors) return 'LIMIT_REACHED';
  if (colors.some((c) => c.toLowerCase() === normalized.toLowerCase())) return 'DUPLICATE';
  return null;
}

export function validateQuantity(value: number, minQuantity: number): QuantityError | null {
  if (!Number.isFinite(value)) return 'NOT_A_NUMBER';
  if (!Number.isInteger(value)) return 'NOT_INTEGER';
  if (value < minQuantity) return 'BELOW_MIN';
  return null;
}
