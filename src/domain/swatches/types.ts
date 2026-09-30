// User-imported colour swatch library (docs/SPEC.md §4g). Pure TS.

import type { Lab } from '../printCoverage/color';

/** Colour model of an ASE entry. */
export type SwatchColorModel = 'RGB' | 'CMYK' | 'LAB' | 'GRAY';

/** ASE colour type: 0 global, 1 spot, 2 normal (process). */
export type SwatchColorType = 'GLOBAL' | 'SPOT' | 'NORMAL';

export type Swatch = {
  /** Name as stored in the file, e.g. "PANTONE 186 C". */
  name: string;
  /** Enclosing group name, or null. */
  group: string | null;
  /** Colour model of the source values. */
  model: SwatchColorModel;
  colorType: SwatchColorType;
  /** CIE L*a*b* (D65, same space as `rgbToLab`) used for matching. */
  lab: Lab;
  /** On-screen preview, `#rrggbb` (clamped to sRGB). */
  hex: string;
  /** True when the conversion is only a naive approximation (CMYK without an ICC profile). */
  approximate: boolean;
};

/** Why an entry was not imported. */
export type SwatchSkipReason = 'UNSUPPORTED_MODEL' | 'MALFORMED' | 'UNNAMED' | 'DUPLICATE' | 'LIMIT';

export type SwatchLibrary = {
  /** Display name (the file name without the extension). */
  name: string;
  fileName: string;
  swatches: Swatch[];
  /** Entries not imported, per reason (missing reason = 0). */
  skipped: Partial<Record<SwatchSkipReason, number>>;
};

/** A swatch of the combined pool of all loaded libraries, with the name of the library it comes from. */
export type PooledSwatch = Swatch & { library: string };

export function countSkipped(library: Pick<SwatchLibrary, 'skipped'>): number {
  return Object.values(library.skipped).reduce((sum, n) => sum + (n ?? 0), 0);
}
