import { describe, expect, it, vi } from 'vitest';
import { buildAse } from '../test/aseBuilder';
import { serializeSwatchLibrary, type SwatchLibrary } from '../domain/swatches';
import { SWATCH_LIBRARY_RULES } from '../domain/config/productCatalog';
import { createSwatchLibraryStore, SWATCH_LIBRARY_STORAGE_KEY, type SwatchStorage } from './swatchLibraryStore';

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

const ase = buildAse([
  { kind: 'color', name: 'PANTONE 186 C', model: 'RGB ', values: [0.78, 0.06, 0.18] },
  { kind: 'color', name: 'PANTONE 300 C', model: 'RGB ', values: [0, 0.37, 0.72] },
  { kind: 'color', name: 'Odd', model: 'HKS ', values: [0] },
]);

describe('swatchLibraryStore', () => {
  it('imports an .ase file, indexes codes and persists it', () => {
    const storage = memoryStorage();
    const store = createSwatchLibraryStore(() => storage);
    expect(store.getState().library).toBeNull();

    const result = store.getState().importAse('Solid Coated.ase', ase);
    expect(result.ok).toBe(true);
    const { library, codeIndex, persisted } = store.getState();
    expect(library?.name).toBe('Solid Coated');
    expect(library?.swatches).toHaveLength(2);
    expect(library?.skipped).toEqual({ UNSUPPORTED_MODEL: 1 });
    expect(codeIndex.get('186 C')?.name).toBe('PANTONE 186 C');
    expect(persisted).toBe(true);
    expect(storage.data.has(SWATCH_LIBRARY_STORAGE_KEY)).toBe(true);

    // A new store instance (page reload) restores it.
    const reloaded = createSwatchLibraryStore(() => storage);
    const restored = reloaded.getState().library;
    expect(restored?.name).toBe(library?.name);
    expect(restored?.skipped).toEqual(library?.skipped);
    expect(restored?.swatches.map((s) => [s.name, s.hex])).toEqual(library?.swatches.map((s) => [s.name, s.hex]));
    expect(reloaded.getState().persisted).toBe(true);
    expect(reloaded.getState().codeIndex.get('300 C')?.name).toBe('PANTONE 300 C');
  });

  it('keeps the current library when an import fails', () => {
    const storage = memoryStorage();
    const store = createSwatchLibraryStore(() => storage);
    store.getState().importAse('a.ase', ase);
    const before = store.getState().library;
    expect(store.getState().importAse('b.ase', new TextEncoder().encode('nope'))).toEqual({ ok: false, error: 'NOT_ASE' });
    expect(store.getState().library).toBe(before);
  });

  it('clears the library from state and storage', () => {
    const storage = memoryStorage();
    const store = createSwatchLibraryStore(() => storage);
    store.getState().importAse('a.ase', ase);
    store.getState().clearLibrary();
    expect(store.getState().library).toBeNull();
    expect(store.getState().codeIndex.size).toBe(0);
    expect(storage.data.has(SWATCH_LIBRARY_STORAGE_KEY)).toBe(false);
  });

  it('works without storage or with throwing storage (session only)', () => {
    for (const getStorage of [() => null, () => throwingStorage(), () => { throw new Error('denied'); }]) {
      const store = createSwatchLibraryStore(getStorage);
      expect(store.getState().library).toBeNull();
      expect(store.getState().importAse('a.ase', ase).ok).toBe(true);
      expect(store.getState().library?.swatches).toHaveLength(2);
      expect(store.getState().persisted).toBe(false);
      expect(() => store.getState().clearLibrary()).not.toThrow();
    }
  });

  it('does not store a library over the size guard and drops the stale stored one', () => {
    const storage = memoryStorage({ [SWATCH_LIBRARY_STORAGE_KEY]: 'old' });
    const store = createSwatchLibraryStore(() => storage);
    const big: SwatchLibrary = {
      name: 'Big',
      fileName: 'Big.ase',
      skipped: {},
      swatches: Array.from({ length: 1 }, () => ({
        name: 'x'.repeat(SWATCH_LIBRARY_RULES.maxStoredChars),
        group: null,
        model: 'RGB' as const,
        colorType: 'SPOT' as const,
        lab: { l: 0, a: 0, b: 0 },
        hex: '#000000',
        approximate: false,
      })),
    };
    store.getState().setLibrary(big);
    expect(store.getState().library).toBe(big);
    expect(store.getState().persisted).toBe(false);
    expect(storage.data.has(SWATCH_LIBRARY_STORAGE_KEY)).toBe(false);
  });

  it('ignores and removes corrupt stored data', () => {
    const storage = memoryStorage({ [SWATCH_LIBRARY_STORAGE_KEY]: '{"v":1,"name":3}' });
    const store = createSwatchLibraryStore(() => storage);
    expect(store.getState().library).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith(SWATCH_LIBRARY_STORAGE_KEY);
  });

  it('restores a library saved in the stored format', () => {
    const library: SwatchLibrary = {
      name: 'Mine',
      fileName: 'Mine.ase',
      skipped: {},
      swatches: [{ name: 'PANTONE 186 C', group: null, model: 'RGB', colorType: 'SPOT', lab: { l: 42, a: 66, b: 38 }, hex: '#c8102e', approximate: false }],
    };
    const storage = memoryStorage({ [SWATCH_LIBRARY_STORAGE_KEY]: serializeSwatchLibrary(library) });
    expect(createSwatchLibraryStore(() => storage).getState().library).toEqual(library);
  });
});
