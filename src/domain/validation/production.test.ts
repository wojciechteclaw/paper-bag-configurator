import { describe, expect, it } from 'vitest';
import { normalizePantoneCode, validatePantoneColorToAdd, validateQuantity } from './production';

describe('normalizePantoneCode', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizePantoneCode('  PMS   186 C ')).toBe('PMS 186 C');
  });
});

describe('validatePantoneColorToAdd', () => {
  it('accepts a new code', () => {
    expect(validatePantoneColorToAdd(['PMS 186 C'], 'PMS 300 C', 8)).toBeNull();
  });

  it('rejects blank input', () => {
    expect(validatePantoneColorToAdd([], '   ', 8)).toBe('EMPTY');
  });

  it('rejects overly long input', () => {
    expect(validatePantoneColorToAdd([], 'x'.repeat(33), 8)).toBe('TOO_LONG');
  });

  it('rejects duplicates case-insensitively after normalisation', () => {
    expect(validatePantoneColorToAdd(['PMS 186 C'], ' pms  186 c', 8)).toBe('DUPLICATE');
  });

  it('rejects more than the maximum number of colours', () => {
    const eight = Array.from({ length: 8 }, (_, i) => `PMS ${100 + i} C`);
    expect(validatePantoneColorToAdd(eight.slice(0, 7), 'PMS 999 C', 8)).toBeNull();
    expect(validatePantoneColorToAdd(eight, 'PMS 999 C', 8)).toBe('LIMIT_REACHED');
  });
});

describe('validateQuantity', () => {
  it.each([
    [Number.NaN, 'NOT_A_NUMBER'],
    [30_000.5, 'NOT_INTEGER'],
    [29_999, 'BELOW_MIN'],
    [30_000, null],
    [1_000_000, null],
  ])('%s → %s', (value, expected) => {
    expect(validateQuantity(value, 30_000)).toBe(expected);
  });
});
