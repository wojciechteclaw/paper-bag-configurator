import { describe, expect, it } from 'vitest';
import { deserializeSwatchLibraries, deserializeSwatchLibrary, packSwatchLibraries, serializeSwatchLibrary } from '../../../src/domain/swatches/storage';
import type { SwatchLibrary } from '../../../src/domain/swatches/types';

const library: SwatchLibrary = {
  name: 'Solid Coated',
  fileName: 'Solid Coated.ase',
  skipped: { UNSUPPORTED_MODEL: 2 },
  swatches: [
    {
      name: 'PANTONE 186 C',
      group: 'Reds',
      model: 'LAB',
      colorType: 'SPOT',
      lab: { l: 42.1234567, a: 66.5, b: 38.25 },
      hex: '#c8102e',
      approximate: false,
    },
    { name: 'Cyan', group: null, model: 'CMYK', colorType: 'NORMAL', lab: { l: 91, a: -48, b: -14 }, hex: '#00ffff', approximate: true },
  ],
};

describe('swatch library storage format', () => {
  it('round-trips a library (Lab rounded to 0.001)', () => {
    const restored = deserializeSwatchLibrary(serializeSwatchLibrary(library));
    expect(restored).toEqual({
      ...library,
      swatches: [{ ...library.swatches[0], lab: { l: 42.123, a: 66.5, b: 38.25 } }, library.swatches[1]],
    });
  });

  it('returns null for missing, corrupt or foreign data instead of throwing', () => {
    expect(deserializeSwatchLibrary(null)).toBeNull();
    expect(deserializeSwatchLibrary('')).toBeNull();
    expect(deserializeSwatchLibrary('{not json')).toBeNull();
    expect(deserializeSwatchLibrary('42')).toBeNull();
    expect(deserializeSwatchLibrary(JSON.stringify({ v: 99, name: 'x', fileName: 'x', swatches: [] }))).toBeNull();
    const stored = JSON.parse(serializeSwatchLibrary(library));
    stored.swatches[0][7] = 'red';
    expect(deserializeSwatchLibrary(JSON.stringify(stored))).toBeNull();
    stored.swatches = [];
    expect(deserializeSwatchLibrary(JSON.stringify(stored))).toBeNull();
  });
});

describe('several libraries in storage', () => {
  const other: SwatchLibrary = { ...library, name: 'Uncoated', fileName: 'Uncoated.ase', skipped: {} };

  it('packs libraries into a v2 container and reads them back in order', () => {
    const { text, stored } = packSwatchLibraries([library, other], 1_000_000);
    expect(stored).toEqual([true, true]);
    expect(JSON.parse(text!).v).toBe(2);
    expect(deserializeSwatchLibraries(text).map((l) => l.fileName)).toEqual(['Solid Coated.ase', 'Uncoated.ase']);
  });

  it('stores libraries in order while they fit into the budget, leaving the others out', () => {
    const oneSize = serializeSwatchLibrary(library).length;
    const big: SwatchLibrary = { ...other, swatches: Array.from({ length: 50 }, () => library.swatches[0]) };
    const { text, stored } = packSwatchLibraries([library, big, other], oneSize * 2 + 40);
    expect(stored).toEqual([true, false, true]);
    expect(deserializeSwatchLibraries(text).map((l) => l.name)).toEqual(['Solid Coated', 'Uncoated']);
    expect(packSwatchLibraries([big], 10)).toEqual({ text: null, stored: [false] });
    expect(packSwatchLibraries([], 10)).toEqual({ text: null, stored: [] });
  });

  it('migrates the single-library (v1) format and drops invalid entries', () => {
    expect(deserializeSwatchLibraries(serializeSwatchLibrary(library)).map((l) => l.name)).toEqual(['Solid Coated']);
    const text = JSON.stringify({ v: 2, libraries: [JSON.parse(serializeSwatchLibrary(other)), { v: 1, name: 3 }] });
    expect(deserializeSwatchLibraries(text).map((l) => l.name)).toEqual(['Uncoated']);
    expect(deserializeSwatchLibraries('{broken')).toEqual([]);
    expect(deserializeSwatchLibraries(null)).toEqual([]);
    expect(deserializeSwatchLibraries('{"v":3}')).toEqual([]);
  });
});
