import { describe, expect, it } from 'vitest';
import type { PantoneColor } from '../types';
import { normalizePantoneCode, validatePantoneColorToAdd } from './production';

const pms = (code: string): PantoneColor => ({ code, hex: '#000000' });

describe('normalizePantoneCode', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizePantoneCode('  PMS   186 C ')).toBe('PMS 186 C');
  });
});

describe('validatePantoneColorToAdd', () => {
  it('accepts a new code', () => {
    expect(validatePantoneColorToAdd([pms('PMS 186 C')], 'PMS 300 C', 8)).toBeNull();
  });

  it('rejects blank input', () => {
    expect(validatePantoneColorToAdd([], '   ', 8)).toBe('EMPTY');
  });

  it('rejects overly long input', () => {
    expect(validatePantoneColorToAdd([], 'x'.repeat(33), 8)).toBe('TOO_LONG');
  });

  it('rejects duplicates case-insensitively after normalisation', () => {
    expect(validatePantoneColorToAdd([pms('PMS 186 C')], ' pms  186 c', 8)).toBe('DUPLICATE');
  });

  it('treats codes with and without the PMS / PANTONE prefix as the same colour', () => {
    expect(validatePantoneColorToAdd([pms('PMS 186 C')], 'PANTONE 186 C', 8)).toBe('DUPLICATE');
    expect(validatePantoneColorToAdd([pms('186 C')], 'pms 186 c', 8)).toBe('DUPLICATE');
    expect(validatePantoneColorToAdd([pms('PMS 186 C')], 'PANTONE 186 U', 8)).toBeNull();
  });

  it('rejects more than the maximum number of colours', () => {
    const eight = Array.from({ length: 8 }, (_, i) => pms(`PMS ${100 + i} C`));
    expect(validatePantoneColorToAdd(eight.slice(0, 7), 'PMS 999 C', 8)).toBeNull();
    expect(validatePantoneColorToAdd(eight, 'PMS 999 C', 8)).toBe('LIMIT_REACHED');
  });
});
