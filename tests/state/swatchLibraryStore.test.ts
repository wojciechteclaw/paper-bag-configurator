import { describe, expect, it, vi } from 'vitest';
import { buildAse } from '../support/aseBuilder';
import { serializeSwatchLibrary, type SwatchLibrary } from '../../src/domain/swatches';
import { SWATCH_LIBRARY_RULES } from '../../src/domain/config/productCatalog';
import { createSwatchLibraryStore, SWATCH_LIBRARY_STORAGE_KEY, type SwatchStorage } from '../../src/state/swatchLibraryStore';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage: SwatchStorage & { data: Map<string, string> } = {
    data,
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void data.set(key, value)),
    removeItem: vi.fn((key: string) => void data.delete(key)),
  };
  return storage;
}

const throwingStorage = (): SwatchStorage => ({
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
  removeItem: () => {
    throw new Error('SecurityError');
  },
});

const coated = buildAse([
  { kind: 'color', name: 'PANTONE 186 C', model: 'RGB ', values: [0.78, 0.06, 0.18] },
  { kind: 'color', name: 'PANTONE 300 C', model: 'RGB ', values: [0, 0.37, 0.72] },
  { kind: 'color', name: 'Odd', model: 'HKS ', values: [0] },
]);
const uncoated = buildAse([
  { kind: 'color', name: 'PANTONE 186 U', model: 'RGB ', values: [0.82, 0.3, 0.35] },
  { kind: 'color', name: 'PANTONE 300 C', model: 'RGB ', values: [0, 0, 0] }, // same code as in Coated
]);

const lib = (fileName: string, count: number, nameLength = 8): SwatchLibrary => ({
  name: fileName.replace(/\.ase$/, ''),
  fileName,
  skipped: {},
  swatches: Array.from({ length: count }, (_, i) => ({
    name: `${fileName} ${i}`.padEnd(nameLength, 'x'),
    group: null,
    model: 'RGB' as const,
    colorType: 'SPOT' as const,
    lab: { l: 0, a: 0, b: 0 },
    hex: '#000000',
    approximate: false,
  })),
});

describe('swatchLibraryStore', () => {
  it('imports several .ase files, pools and indexes their codes, and persists them', () => {
    const storage = memoryStorage();
    const store = createSwatchLibraryStore(() => storage);
    expect(store.getState().libraries).toEqual([]);

    expect(store.getState().importAse('Solid Coated.ase', coated).ok).toBe(true);
    expect(store.getState().importAse('Solid Uncoated.ase', uncoated).ok).toBe(true);
    const { libraries, codeIndex, swatches, sessionOnly } = store.getState();
    expect(libraries.map((l) => l.name)).toEqual(['Solid Coated', 'Solid Uncoated']);
    expect(libraries[0].skipped).toEqual({ UNSUPPORTED_MODEL: 1 });
    expect(swatches.map((s) => `${s.name} / ${s.library}`)).toEqual([
      'PANTONE 186 C / Solid Coated',
      'PANTONE 300 C / Solid Coated',
      'PANTONE 186 U / Solid Uncoated',
    ]);
    expect(codeIndex.get('300 C')?.library).toBe('Solid Coated');
    expect(codeIndex.get('186 U')?.library).toBe('Solid Uncoated');
    expect(sessionOnly).toEqual([]);

    // A new store instance (page reload) restores both.
    const reloaded = createSwatchLibraryStore(() => storage);
    expect(reloaded.getState().libraries.map((l) => l.fileName)).toEqual(['Solid Coated.ase', 'Solid Uncoated.ase']);
    expect(reloaded.getState().codeIndex.get('186 U')?.name).toBe('PANTONE 186 U');
  });

  it('replaces a library re-imported under the same file name, keeping its position', () => {
    const store = createSwatchLibraryStore(() => memoryStorage());
    store.getState().importAse('a.ase', coated);
    store.getState().importAse('b.ase', uncoated);
    store.getState().importAse('A.ase', uncoated);
    expect(store.getState().libraries.map((l) => [l.fileName, l.swatches.length])).toEqual([
      ['A.ase', 2],
      ['b.ase', 2],
    ]);
  });

  it('keeps the current libraries when an import fails or breaks a limit', () => {
    const store = createSwatchLibraryStore(() => memoryStorage());
    store.getState().importAse('a.ase', coated);
    const before = store.getState().libraries;
    expect(store.getState().importAse('b.ase', new TextEncoder().encode('nope'))).toEqual({ ok: false, error: 'NOT_ASE' });
    for (let i = store.getState().libraries.length; i < SWATCH_LIBRARY_RULES.maxLibraries; i++) {
      expect(store.getState().addLibrary(lib(`l${i}.ase`, 1))).toBeNull();
    }
    expect(store.getState().importAse('one-too-many.ase', uncoated)).toEqual({ ok: false, error: 'TOO_MANY_LIBRARIES' });
    expect(store.getState().libraries).toHaveLength(SWATCH_LIBRARY_RULES.maxLibraries);
    expect(store.getState().libraries[0]).toBe(before[0]);
    store.getState().clearLibraries();
    expect(store.getState().addLibrary(lib('huge.ase', SWATCH_LIBRARY_RULES.maxTotalColors + 1))).toBe('TOO_MANY_COLORS');
    expect(store.getState().libraries).toEqual([]);
  });

  it('removes one library or all of them, also from storage', () => {
    const storage = memoryStorage();
    const store = createSwatchLibraryStore(() => storage);
    store.getState().importAse('a.ase', coated);
    store.getState().importAse('b.ase', uncoated);
    store.getState().removeLibrary('a.ase');
    expect(store.getState().libraries.map((l) => l.fileName)).toEqual(['b.ase']);
    expect(store.getState().codeIndex.get('186 C')).toBeUndefined();
    expect(createSwatchLibraryStore(() => storage).getState().libraries.map((l) => l.fileName)).toEqual(['b.ase']);
    store.getState().clearLibraries();
    expect(store.getState().swatches).toEqual([]);
    expect(storage.data.has(SWATCH_LIBRARY_STORAGE_KEY)).toBe(false);
  });

  it('works without storage or with throwing storage (session only)', () => {
    for (const getStorage of [() => null, () => throwingStorage(), () => { throw new Error('denied'); }]) {
      const store = createSwatchLibraryStore(getStorage);
      expect(store.getState().libraries).toEqual([]);
      expect(store.getState().importAse('a.ase', coated).ok).toBe(true);
      expect(store.getState().libraries[0].swatches).toHaveLength(2);
      expect(store.getState().sessionOnly).toEqual(['a.ase']);
      expect(() => store.getState().clearLibraries()).not.toThrow();
    }
  });

  it('applies the storage budget to all libraries together: what does not fit stays session-only', () => {
    const storage = memoryStorage();
    const store = createSwatchLibraryStore(() => storage);
    const huge = lib('huge.ase', 1, SWATCH_LIBRARY_RULES.maxStoredChars);
    store.getState().addLibrary(lib('small.ase', 2));
    store.getState().addLibrary(huge);
    store.getState().addLibrary(lib('small2.ase', 2));
    expect(store.getState().sessionOnly).toEqual(['huge.ase']);
    const reloaded = createSwatchLibraryStore(() => storage);
    expect(reloaded.getState().libraries.map((l) => l.fileName)).toEqual(['small.ase', 'small2.ase']);

    // Only an oversized library: nothing stored, stale data dropped.
    store.getState().clearLibraries();
    storage.data.set(SWATCH_LIBRARY_STORAGE_KEY, 'stale');
    store.getState().addLibrary(huge);
    expect(store.getState().sessionOnly).toEqual(['huge.ase']);
    expect(storage.data.has(SWATCH_LIBRARY_STORAGE_KEY)).toBe(false);
  });

  it('migrates a library stored in the single-library format and rewrites it as a list on the next change', () => {
    const single = lib('Mine.ase', 1);
    const storage = memoryStorage({ [SWATCH_LIBRARY_STORAGE_KEY]: serializeSwatchLibrary(single) });
    const store = createSwatchLibraryStore(() => storage);
    expect(store.getState().libraries).toEqual([single]);
    store.getState().importAse('b.ase', uncoated);
    expect(JSON.parse(storage.data.get(SWATCH_LIBRARY_STORAGE_KEY)!).libraries).toHaveLength(2);
  });

  it('ignores and removes corrupt stored data', () => {
    const storage = memoryStorage({ [SWATCH_LIBRARY_STORAGE_KEY]: '{"v":1,"name":3}' });
    const store = createSwatchLibraryStore(() => storage);
    expect(store.getState().libraries).toEqual([]);
    expect(storage.removeItem).toHaveBeenCalledWith(SWATCH_LIBRARY_STORAGE_KEY);
  });
});
