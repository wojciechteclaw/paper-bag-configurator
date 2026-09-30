import { describe, expect, it } from 'vitest';
import { deserializeSwatchLibrary, serializeSwatchLibrary } from './storage';
import type { SwatchLibrary } from './types';

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
