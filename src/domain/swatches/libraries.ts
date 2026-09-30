// Several user-imported swatch libraries at once (docs/SPEC.md §4g, client [K] 30.09.2026). Pure TS.

import { SWATCH_LIBRARY_RULES } from '../config/productCatalog';
import { pantoneLookupKey } from '../printColors';
import type { PooledSwatch, SwatchLibrary } from './types';

/** Identity of a library in the list: its file name, case-insensitive (re-importing the same file replaces it). */
export function swatchLibraryKey(library: Pick<SwatchLibrary, 'fileName'>): string {
  return library.fileName.trim().toLowerCase();
}

export type SwatchLibraryLimitError = 'TOO_MANY_LIBRARIES' | 'TOO_MANY_COLORS';

export type SwatchLibraryLimits = { maxLibraries: number; maxTotalColors: number };

/**
 * Adds `incoming` to `libraries`, replacing the library with the same key in place (otherwise appended), or reports
 * which limit it would break. The replaced library does not count against the limits.
 */
export function addSwatchLibrary(
  libraries: readonly SwatchLibrary[],
  incoming: SwatchLibrary,
  limits: SwatchLibraryLimits = SWATCH_LIBRARY_RULES,
): { ok: true; libraries: SwatchLibrary[] } | { ok: false; error: SwatchLibraryLimitError } {
  const key = swatchLibraryKey(incoming);
  const index = libraries.findIndex((library) => swatchLibraryKey(library) === key);
  const others = libraries.filter((_, i) => i !== index);
  if (others.length + 1 > limits.maxLibraries) return { ok: false, error: 'TOO_MANY_LIBRARIES' };
  const colors = others.reduce((sum, library) => sum + library.swatches.length, incoming.swatches.length);
  if (colors > limits.maxTotalColors) return { ok: false, error: 'TOO_MANY_COLORS' };
  const next = [...libraries];
  if (index >= 0) next[index] = incoming;
  else next.push(incoming);
  return { ok: true, libraries: next };
}

/**
 * All swatches of the loaded libraries in one list, each tagged with its library. A code present in several libraries
 * appears once — from the library imported first (the same rule as duplicates inside one file).
 */
export function poolSwatches(libraries: readonly SwatchLibrary[]): PooledSwatch[] {
  const seen = new Set<string>();
  const pool: PooledSwatch[] = [];
  for (const library of libraries) {
    for (const swatch of library.swatches) {
      const key = pantoneLookupKey(swatch.name);
      if (seen.has(key)) continue;
      seen.add(key);
      pool.push({ ...swatch, library: library.name });
    }
  }
  return pool;
}
