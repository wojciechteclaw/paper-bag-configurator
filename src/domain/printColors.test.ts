import { describe, expect, it } from 'vitest';
import { PANTONE_FALLBACK_PREVIEW_COLORS } from './config/productCatalog';
import { pantoneLookupKey, suggestPantonePreviewHex } from './printColors';

describe('pantoneLookupKey', () => {
  it('drops the PMS / Pantone prefix and normalises case and spaces', () => {
    expect(pantoneLookupKey('  pms   186 c ')).toBe('186 C');
    expect(pantoneLookupKey('Pantone Black C')).toBe('BLACK C');
    expect(pantoneLookupKey('PMS186 C')).toBe('186 C');
  });
});

describe('suggestPantonePreviewHex', () => {
  it('suggests a known approximation for common codes', () => {
    expect(suggestPantonePreviewHex('PMS 186 C')).toBe('#c8102e');
    expect(suggestPantonePreviewHex('pantone reflex blue c')).toBe('#001489');
    expect(suggestPantonePreviewHex('White')).toBe('#ffffff');
  });

  it('falls back to the first unused distinct colour for unknown codes', () => {
    expect(suggestPantonePreviewHex('PMS 7621 C')).toBe(PANTONE_FALLBACK_PREVIEW_COLORS[0]);
    expect(suggestPantonePreviewHex('PMS 7621 C', [PANTONE_FALLBACK_PREVIEW_COLORS[0].toUpperCase()])).toBe(
      PANTONE_FALLBACK_PREVIEW_COLORS[1],
    );
    expect(suggestPantonePreviewHex('X', PANTONE_FALLBACK_PREVIEW_COLORS)).toBe(PANTONE_FALLBACK_PREVIEW_COLORS[0]);
  });
});
