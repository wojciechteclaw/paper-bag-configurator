import { create } from 'zustand';
import { SWATCH_LIBRARY_RULES } from '../domain/config/productCatalog';
import {
  addSwatchLibrary,
  deserializeSwatchLibraries,
  indexSwatchesByCode,
  packSwatchLibraries,
  parseAse,
  poolSwatches,
  swatchLibraryKey,
  type AseError,
  type PooledSwatch,
  type SwatchCodeIndex,
  type SwatchLibrary,
  type SwatchLibraryLimitError,
} from '../domain/swatches';

// User-imported colour swatch libraries (docs/SPEC.md §4g). Several at once (client [K] 30.09.2026, e.g. Coated +
// Uncoated). A local tool of the user — deliberately NOT part of BagConfiguration, pricing or exports. Remembered in
// this browser's localStorage when possible; the app works the same without storage (private mode, blocked site data,
// quota exceeded) — libraries that cannot be stored last for the session.

/** localStorage key of the imported libraries (older data there: one library, migrated on load). */
export const SWATCH_LIBRARY_STORAGE_KEY = 'paper-bag-configurator.swatchLibrary';

export type SwatchStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type SwatchImportError = AseError | SwatchLibraryLimitError;

export type SwatchImportResult = { ok: true; library: SwatchLibrary } | { ok: false; error: SwatchImportError };

export type SwatchLibraryState = {
  /** Loaded libraries in import order (a re-imported file keeps its position). */
  libraries: SwatchLibrary[];
  /** Swatches of all libraries, each code once (first library wins), tagged with the library name. */
  swatches: PooledSwatch[];
  /** `swatches` by normalised Pantone code. */
  codeIndex: SwatchCodeIndex<PooledSwatch>;
  /** Keys (`swatchLibraryKey`) of libraries not saved in local storage (over the budget, storage unavailable or full). */
  sessionOnly: string[];
  /**
   * Parses an .ase file and adds it (a library with the same file name is replaced). Failed parses and imports over
   * the limits change nothing.
   */
  importAse: (fileName: string, data: ArrayBuffer | ArrayBufferView) => SwatchImportResult;
  /** Adds / replaces a parsed library; returns the broken limit, or null. */
  addLibrary: (library: SwatchLibrary) => SwatchLibraryLimitError | null;
  /** Removes one library by its key (`swatchLibraryKey`). */
  removeLibrary: (key: string) => void;
  /** Removes all libraries (also from storage). */
  clearLibraries: () => void;
};

function browserStorage(): SwatchStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function safely<T>(action: () => T): T | undefined {
  try {
    return action();
  } catch {
    return undefined;
  }
}

const derive = (libraries: SwatchLibrary[]) => {
  const swatches = poolSwatches(libraries);
  return { libraries, swatches, codeIndex: indexSwatchesByCode(swatches) };
};

/** Store factory; `getStorage` is injectable for tests (default: `localStorage`, or none when inaccessible). */
export function createSwatchLibraryStore(getStorage: () => SwatchStorage | null = browserStorage) {
  const storage = () => safely(getStorage) ?? null;

  const load = (): SwatchLibrary[] => {
    const store = storage();
    if (!store) return [];
    const text = safely(() => store.getItem(SWATCH_LIBRARY_STORAGE_KEY));
    if (text == null) return [];
    const libraries = deserializeSwatchLibraries(text).slice(0, SWATCH_LIBRARY_RULES.maxLibraries);
    if (libraries.length === 0) safely(() => store.removeItem(SWATCH_LIBRARY_STORAGE_KEY));
    return libraries;
  };

  /** Saves what fits into the budget; returns the keys of libraries kept for the session only. */
  const save = (libraries: SwatchLibrary[]): string[] => {
    const allKeys = libraries.map(swatchLibraryKey);
    const store = storage();
    if (!store) return allKeys;
    const { text, stored } = packSwatchLibraries(libraries, SWATCH_LIBRARY_RULES.maxStoredChars);
    const written =
      text !== null &&
      safely(() => {
        store.setItem(SWATCH_LIBRARY_STORAGE_KEY, text);
        return true;
      }) === true;
    if (!written) {
      // Nothing (or nothing that fits) is stored: drop stale data so a reload does not bring back removed libraries.
      safely(() => store.removeItem(SWATCH_LIBRARY_STORAGE_KEY));
      return allKeys;
    }
    return allKeys.filter((_, i) => !stored[i]);
  };

  const initial = load();

  return create<SwatchLibraryState>()((set, get) => {
    const replaceAll = (libraries: SwatchLibrary[]) => set({ ...derive(libraries), sessionOnly: save(libraries) });

    return {
      ...derive(initial),
      sessionOnly: [],

      importAse: (fileName, data) => {
        const result = parseAse(data, fileName);
        if (!result.ok) return result;
        const error = get().addLibrary(result.library);
        return error ? { ok: false, error } : result;
      },

      addLibrary: (library) => {
        const result = addSwatchLibrary(get().libraries, library);
        if (!result.ok) return result.error;
        replaceAll(result.libraries);
        return null;
      },

      removeLibrary: (key) => replaceAll(get().libraries.filter((library) => swatchLibraryKey(library) !== key)),

      clearLibraries: () => replaceAll([]),
    };
  });
}

export const useSwatchLibraryStore = createSwatchLibraryStore();
