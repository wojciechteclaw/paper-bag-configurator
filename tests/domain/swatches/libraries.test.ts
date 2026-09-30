import { describe, expect, it } from 'vitest';
import { addSwatchLibrary, poolSwatches, swatchLibraryKey } from '../../../src/domain/swatches/libraries';
import type { Swatch, SwatchLibrary } from '../../../src/domain/swatches/types';

const swatch = (name: string, hex = '#000000'): Swatch => ({
  name,
  group: null,
  model: 'RGB',
  colorType: 'SPOT',
  lab: { l: 0, a: 0, b: 0 },
  hex,
  approximate: false,
});

const lib = (fileName: string, names: string[], hex?: string): SwatchLibrary => ({
  name: fileName.replace(/\.ase$/i, ''),
  fileName,
  skipped: {},
  swatches: names.map((n) => swatch(n, hex)),
});

const limits = { maxLibraries: 3, maxTotalColors: 5 };

describe('addSwatchLibrary', () => {
  it('appends new libraries and replaces one with the same file name (case-insensitive) in place', () => {
    const coated = lib('Coated.ase', ['PANTONE 186 C']);
    const uncoated = lib('Uncoated.ase', ['PANTONE 186 U']);
    const step1 = addSwatchLibrary([], coated, limits);
    const step2 = step1.ok ? addSwatchLibrary(step1.libraries, uncoated, limits) : step1;
    expect(step2.ok && step2.libraries.map((l) => l.fileName)).toEqual(['Coated.ase', 'Uncoated.ase']);

    const coated2 = lib('COATED.ase', ['PANTONE 300 C', 'PANTONE 485 C']);
    const step3 = step2.ok ? addSwatchLibrary(step2.libraries, coated2, limits) : step2;
    expect(step3.ok && step3.libraries.map((l) => l.fileName)).toEqual(['COATED.ase', 'Uncoated.ase']);
    expect(swatchLibraryKey(coated)).toBe(swatchLibraryKey(coated2));
  });

  it('rejects an import over the library or total-colour limit; a replaced library does not count', () => {
    const three = [lib('a.ase', ['A']), lib('b.ase', ['B']), lib('c.ase', ['C'])];
    expect(addSwatchLibrary(three, lib('d.ase', ['D']), limits)).toEqual({ ok: false, error: 'TOO_MANY_LIBRARIES' });
    expect(addSwatchLibrary(three, lib('c.ase', ['C', 'C2', 'C3']), limits).ok).toBe(true);
    expect(addSwatchLibrary(three, lib('c.ase', ['C', 'C2', 'C3', 'C4']), limits)).toEqual({ ok: false, error: 'TOO_MANY_COLORS' });
  });
});

describe('poolSwatches', () => {
  it('pools all libraries, tags each swatch with its library and keeps a code once (first library wins)', () => {
    const pool = poolSwatches([
      lib('Coated.ase', ['PANTONE 186 C', 'PANTONE 300 C'], '#111111'),
      lib('Other.ase', ['186 C', 'PANTONE 186 U'], '#222222'),
    ]);
    expect(pool.map((s) => [s.name, s.library, s.hex])).toEqual([
      ['PANTONE 186 C', 'Coated', '#111111'],
      ['PANTONE 300 C', 'Coated', '#111111'],
      ['PANTONE 186 U', 'Other', '#222222'],
    ]);
  });
});
