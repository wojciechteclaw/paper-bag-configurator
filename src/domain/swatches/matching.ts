// Matching against user-imported swatch libraries (docs/SPEC.md §4g). Pure TS.
// Generic over the swatch type so the pooled swatches of several libraries keep their library name.

import { pantoneLookupKey } from '../printColors';
import { deltaE2000, type Lab } from '../printCoverage/color';
import type { Swatch } from './types';

/** Swatches keyed by the normalised Pantone code (`pantoneLookupKey`): "PANTONE 186 C", "PMS 186 C", "186 C" → "186 C". */
export type SwatchCodeIndex<T extends Swatch = Swatch> = ReadonlyMap<string, T>;

export function indexSwatchesByCode<T extends Swatch>(swatches: readonly T[]): SwatchCodeIndex<T> {
  const index = new Map<string, T>();
  for (const swatch of swatches) {
    const key = pantoneLookupKey(swatch.name);
    if (key && !index.has(key)) index.set(key, swatch);
  }
  return index;
}

/** The library swatch of a (user-typed) Pantone code, or null. */
export function findSwatchByCode<T extends Swatch>(index: SwatchCodeIndex<T>, code: string): T | null {
  const key = pantoneLookupKey(code);
  return key ? (index.get(key) ?? null) : null;
}

export type SwatchMatch<T extends Swatch = Swatch> = { swatch: T; /** CIEDE2000 ΔE00 to the target colour. */ deltaE: number };

/** The `count` swatches nearest to `lab` by CIEDE2000, closest first (ties keep list order). */
export function findNearestSwatches<T extends Swatch>(swatches: readonly T[], lab: Lab, count: number): SwatchMatch<T>[] {
  if (count <= 0) return [];
  const best: SwatchMatch<T>[] = [];
  for (const swatch of swatches) {
    const deltaE = deltaE2000(lab, swatch.lab);
    if (best.length === count && deltaE >= best[count - 1].deltaE) continue;
    let at = best.length;
    while (at > 0 && best[at - 1].deltaE > deltaE) at--;
    best.splice(at, 0, { swatch, deltaE });
    if (best.length > count) best.pop();
  }
  return best;
}
