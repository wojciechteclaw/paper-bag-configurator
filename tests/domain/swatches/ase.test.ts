import { describe, expect, it } from 'vitest';
import { buildAse } from '../../support/aseBuilder';
import { SWATCH_LIBRARY_RULES } from '../../../src/domain/config/productCatalog';
import { deltaE2000, rgbToLab } from '../../../src/domain/printCoverage/color';
import { libraryNameFromFileName, parseAse } from '../../../src/domain/swatches/ase';
import { countSkipped } from '../../../src/domain/swatches/types';

const library = (buffer: ArrayBuffer, fileName = 'Test.ase') => {
  const result = parseAse(buffer, fileName);
  if (!result.ok) throw new Error(`parse failed: ${result.error}`);
  return result.library;
};

describe('parseAse', () => {
  it('reads RGB, LAB, CMYK and Gray entries with names, groups and colour types', () => {
    const lib = library(
      buildAse([
        { kind: 'groupStart', name: 'Spot colours' },
        { kind: 'color', name: 'PANTONE 186 C', model: 'LAB ', values: [0.42, 66, 38], colorType: 1 },
        { kind: 'color', name: 'Red RGB', model: 'RGB ', values: [1, 0, 0], colorType: 0 },
        { kind: 'groupEnd' },
        { kind: 'color', name: 'Cyan', model: 'CMYK', values: [1, 0, 0, 0], colorType: 2 },
        { kind: 'color', name: 'Mid grey', model: 'Gray', values: [0.5] },
      ]),
      'Pantone Formula Guide.ase',
    );
    expect(lib.name).toBe('Pantone Formula Guide');
    expect(lib.fileName).toBe('Pantone Formula Guide.ase');
    expect(countSkipped(lib)).toBe(0);
    expect(lib.swatches.map((s) => [s.name, s.group, s.model, s.colorType, s.approximate])).toEqual([
      ['PANTONE 186 C', 'Spot colours', 'LAB', 'SPOT', false],
      ['Red RGB', 'Spot colours', 'RGB', 'GLOBAL', false],
      ['Cyan', null, 'CMYK', 'NORMAL', true],
      ['Mid grey', null, 'GRAY', 'SPOT', false],
    ]);
    const [pantone, red, cyan, grey] = lib.swatches;
    // L stored as 0..1 → × 100; D50 → D65 keeps L of a mid red close.
    expect(pantone.lab.l).toBeGreaterThan(40);
    expect(pantone.lab.l).toBeLessThan(44);
    expect(pantone.hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(pantone.hex.slice(1, 3) > 'a0').toBe(true); // clearly red
    expect(red.hex).toBe('#ff0000');
    expect(deltaE2000(red.lab, rgbToLab(255, 0, 0))).toBeLessThan(1e-9);
    expect(cyan.hex).toBe('#00ffff');
    expect(grey.hex).toBe('#808080');
  });

  it('skips unsupported models, malformed, unnamed and duplicate entries with counts, and ignores unknown blocks', () => {
    const lib = library(
      buildAse([
        { kind: 'color', name: 'PANTONE 186 C', model: 'RGB ', values: [0.78, 0.06, 0.18] },
        { kind: 'color', name: 'Hexachrome', model: 'HKS ', values: [1, 0, 0] },
        { kind: 'color', name: 'NaN', model: 'RGB ', values: [Number.NaN, 0, 0] },
        { kind: 'color', name: '', model: 'RGB ', values: [0, 0, 0] },
        { kind: 'color', name: '186 C', model: 'RGB ', values: [0, 0, 1] },
        { kind: 'raw', type: 0x0001, data: [0, 9, 0, 65] }, // name longer than the block
        { kind: 'raw', type: 0x7777, data: [1, 2, 3] },
        { kind: 'color', name: 'PANTONE 300 C', model: 'RGB ', values: [0, 0.37, 0.72] },
      ]),
    );
    expect(lib.swatches.map((s) => s.name)).toEqual(['PANTONE 186 C', 'PANTONE 300 C']);
    expect(lib.skipped).toEqual({ UNSUPPORTED_MODEL: 1, MALFORMED: 2, UNNAMED: 1, DUPLICATE: 1 });
    expect(countSkipped(lib)).toBe(5);
  });

  it('keeps at most maxEntries colours and counts the rest', () => {
    const blocks = ['A', 'B', 'C'].map((name) => ({ kind: 'color' as const, name, model: 'RGB ', values: [0, 0, 0] }));
    const result = parseAse(buildAse(blocks), 'x.ase', { maxEntries: 2 });
    expect(result.ok && result.library.swatches.length).toBe(2);
    expect(result.ok && result.library.skipped).toEqual({ LIMIT: 1 });
  });

  it('rejects empty, oversized, non-ASE, unsupported-version and truncated files with typed errors', () => {
    const one = [{ kind: 'color' as const, name: 'A', model: 'RGB ', values: [0, 0, 0] }];
    expect(parseAse(new ArrayBuffer(0), 'x.ase')).toEqual({ ok: false, error: 'EMPTY_FILE' });
    expect(parseAse(buildAse(one), 'x.ase', { maxFileSizeBytes: 10 })).toEqual({ ok: false, error: 'TOO_LARGE' });
    expect(parseAse(new TextEncoder().encode('GIF89a not a swatch file'), 'x.ase')).toEqual({ ok: false, error: 'NOT_ASE' });
    expect(parseAse(new Uint8Array([0x41, 0x53, 0x45]), 'x.ase')).toEqual({ ok: false, error: 'NOT_ASE' });
    expect(parseAse(buildAse(one, { version: 2 }), 'x.ase')).toEqual({ ok: false, error: 'UNSUPPORTED_VERSION' });
    expect(parseAse(buildAse(one, { blockCount: 2 }), 'x.ase')).toEqual({ ok: false, error: 'TRUNCATED' });
    const cut = buildAse(one).slice(0, 20);
    expect(parseAse(cut, 'x.ase')).toEqual({ ok: false, error: 'TRUNCATED' });
    expect(parseAse(buildAse([]), 'x.ase')).toEqual({ ok: false, error: 'NO_COLORS' });
    expect(parseAse(buildAse([{ kind: 'color', name: 'X', model: 'HKS ', values: [0] }]), 'x.ase')).toEqual({
      ok: false,
      error: 'NO_COLORS',
    });
  });

  it('uses the catalog file-size limit by default and accepts typed-array views', () => {
    expect(SWATCH_LIBRARY_RULES.maxFileSizeBytes).toBeGreaterThan(1024 * 1024);
    const bytes = new Uint8Array(buildAse([{ kind: 'color', name: 'A', model: 'RGB ', values: [0, 0, 0] }]));
    const padded = new Uint8Array(bytes.length + 4);
    padded.set(bytes, 4);
    expect(parseAse(padded.subarray(4), 'x.ase').ok).toBe(true);
  });
});

describe('libraryNameFromFileName', () => {
  it('drops directories and the .ase extension', () => {
    expect(libraryNameFromFileName('C:\\swatches\\Pantone Solid Coated.ASE')).toBe('Pantone Solid Coated');
    expect(libraryNameFromFileName('.ase')).toBe('.ase');
  });
});
