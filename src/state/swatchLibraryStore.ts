import { create } from 'zustand';
import { SWATCH_LIBRARY_RULES } from '../domain/config/productCatalog';
import {
  deserializeSwatchLibrary,
  indexSwatchesByCode,
  parseAse,
  serializeSwatchLibrary,
  type AseParseResult,
  type SwatchCodeIndex,
  type SwatchLibrary,
} from '../domain/swatches';

// User-imported colour swatch library (docs/SPEC.md §4g). A local tool of the user — deliberately NOT part of
// BagConfiguration, pricing or exports. Remembered in this browser's localStorage when possible; the app works the
// same without storage (private mode, blocked site data, quota exceeded) — the library then lasts for the session.

/** localStorage key of the imported library. */
export const SWATCH_LIBRARY_STORAGE_KEY = 'paper-bag-configurator.swatchLibrary';

export type SwatchStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type SwatchLibraryState = {
  library: SwatchLibrary | null;
  /** Library swatches by normalised Pantone code (empty without a library). */
  codeIndex: SwatchCodeIndex;
  /** True when the current library is saved in local storage (false: too large, storage unavailable or full). */
  persisted: boolean;
  /** Parses an .ase file; on success replaces the current library (and stores it). Failed imports change nothing. */
  importAse: (fileName: string, data: ArrayBuffer | ArrayBufferView) => AseParseResult;
  /** Replaces the current library. */
  setLibrary: (library: SwatchLibrary) => void;
  /** Removes the library (also from storage). */
  clearLibrary: () => void;
};

const EMPTY_INDEX: SwatchCodeIndex = new Map();

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

/** Store factory; `getStorage` is injectable for tests (default: `localStorage`, or none when inaccessible). */
export function createSwatchLibraryStore(getStorage: () => SwatchStorage | null = browserStorage) {
  const storage = () => safely(getStorage) ?? null;

  const load = (): SwatchLibrary | null => {
    const store = storage();
    if (!store) return null;
    const text = safely(() => store.getItem(SWATCH_LIBRARY_STORAGE_KEY));
    if (text == null) return null;
    const library = deserializeSwatchLibrary(text);
    if (!library) safely(() => store.removeItem(SWATCH_LIBRARY_STORAGE_KEY));
    return library;
  };

  /** Saves the library; false when it cannot be kept (the stale previous library is removed then). */
  const save = (library: SwatchLibrary): boolean => {
    const store = storage();
    if (!store) return false;
    const text = serializeSwatchLibrary(library);
    const saved =
      text.length <= SWATCH_LIBRARY_RULES.maxStoredChars &&
      safely(() => {
        store.setItem(SWATCH_LIBRARY_STORAGE_KEY, text);
        return true;
      }) === true;
    if (!saved) safely(() => store.removeItem(SWATCH_LIBRARY_STORAGE_KEY));
    return saved;
  };

  const initial = load();

  return create<SwatchLibraryState>()((set, get) => ({
    library: initial,
    codeIndex: initial ? indexSwatchesByCode(initial.swatches) : EMPTY_INDEX,
    persisted: initial !== null,

    importAse: (fileName, data) => {
      const result = parseAse(data, fileName);
      if (result.ok) get().setLibrary(result.library);
      return result;
    },

    setLibrary: (library) =>
      set({ library, codeIndex: indexSwatchesByCode(library.swatches), persisted: save(library) }),

    clearLibrary: () => {
      const store = storage();
      if (store) safely(() => store.removeItem(SWATCH_LIBRARY_STORAGE_KEY));
      set({ library: null, codeIndex: EMPTY_INDEX, persisted: false });
    },
  }));
}

export const useSwatchLibraryStore = createSwatchLibraryStore();
