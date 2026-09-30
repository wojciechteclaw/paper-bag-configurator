import { describe, expect, it } from 'vitest';
import { hexToRgb, rgbToLab } from '../printCoverage/color';
import { findNearestSwatches, findSwatchByCode, indexSwatchesByCode } from './matching';
import type { Swatch } from './types';

const swatch = (name: string, hex: string): Swatch => {
  const { r, g, b } = hexToRgb(hex)!;
  return { name, group: null, model: 'RGB', colorType: 'SPOT', lab: rgbToLab(r, g, b), hex, approximate: false };
};

const swatches = [
  swatch('PANTONE 186 C', '#c8102e'),
  swatch('PANTONE 485 C', '#da291c'),
  swatch('PANTONE 300 C', '#005eb8'),
  swatch('PANTONE Black C', '#2d2926'),
];

describe('findSwatchByCode', () => {
  it('finds a swatch by the normalised Pantone code', () => {
    const index = indexSwatchesByCode(swatches);
    expect(findSwatchByCode(index, '186 C')?.name).toBe('PANTONE 186 C');
    expect(findSwatchByCode(index, 'pms  186 c')?.name).toBe('PANTONE 186 C');
    expect(findSwatchByCode(index, 'Pantone black c')?.hex).toBe('#2d2926');
    expect(findSwatchByCode(index, '187 C')).toBeNull();
    expect(findSwatchByCode(index, '   ')).toBeNull();
  });

  it('keeps the first swatch of a duplicated code', () => {
    const index = indexSwatchesByCode([swatch('186 C', '#111111'), swatch('PANTONE 186 C', '#222222')]);
    expect(findSwatchByCode(index, 'PANTONE 186 C')?.hex).toBe('#111111');
  });
});

describe('findNearestSwatches', () => {
  it('returns the N nearest swatches by CIEDE2000, closest first', () => {
    const matches = findNearestSwatches(swatches, rgbToLab(0xc8, 0x10, 0x30), 2);
    expect(matches.map((m) => m.swatch.name)).toEqual(['PANTONE 186 C', 'PANTONE 485 C']);
    expect(matches[0].deltaE).toBeLessThan(1);
    expect(matches[1].deltaE).toBeGreaterThan(matches[0].deltaE);
  });

  it('handles counts larger than the library and non-positive counts', () => {
    expect(findNearestSwatches(swatches, rgbToLab(0, 0, 0), 10).map((m) => m.swatch.name)[0]).toBe('PANTONE Black C');
    expect(findNearestSwatches(swatches, rgbToLab(0, 0, 0), 10)).toHaveLength(4);
    expect(findNearestSwatches(swatches, rgbToLab(0, 0, 0), 0)).toEqual([]);
    expect(findNearestSwatches([], rgbToLab(0, 0, 0), 3)).toEqual([]);
  });
});
