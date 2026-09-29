import type { BagType, Dimensions, HandleType, PackagingType, PaperColor, PrintTechnology } from '../types';

export type Range = { min: number; max: number };

/** Dimensions are entered in 5 mm increments. */
export const DIMENSION_STEP_MM = 5;

export type DimensionLimits = Record<keyof Dimensions, Range>;

export type BagTypeDefinition = {
  type: BagType;
  available: boolean;
  defaultDimensions: Dimensions;
  limits: DimensionLimits;
  supportedHandles: HandleType[];
  paperColors: PaperColor[];
  /** Selectable grammages: min..max in `step` increments (g/m²). */
  grammage: Range & { default: number; step: number };
  print: { technologies: PrintTechnology[]; maxColors: number };
  packaging: PackagingType[];
  minQuantity: number;
};

// Source: https://www.promarjarocin.pl/torby-klockowe/ (width, height, grammage, print, min run).
// TODO: depth range is not published — 40–300 mm is a placeholder to confirm with production.
export const BAG_TYPES: Record<BagType, BagTypeDefinition> = {
  BLOCK: {
    type: 'BLOCK',
    available: true,
    defaultDimensions: { width: 200, height: 400, depth: 150 },
    limits: {
      width: { min: 75, max: 260 },
      height: { min: 170, max: 430 },
      depth: { min: 40, max: 300 },
    },
    supportedHandles: ['FLAT_PAPER', 'TWISTED_PAPER'],
    paperColors: ['BROWN', 'WHITE'],
    grammage: { min: 40, max: 100, default: 80, step: 10 },
    print: { technologies: ['FLEXO'], maxColors: 8 },
    packaging: ['CARTON', 'FOIL'],
    minQuantity: 30_000,
  },
  FOLDED: {
    type: 'FOLDED',
    available: false,
    defaultDimensions: { width: 200, height: 400, depth: 150 },
    limits: {
      width: { min: 75, max: 260 },
      height: { min: 170, max: 430 },
      depth: { min: 40, max: 300 },
    },
    supportedHandles: [],
    paperColors: ['BROWN', 'WHITE'],
    grammage: { min: 40, max: 100, default: 80, step: 10 },
    print: { technologies: ['FLEXO'], maxColors: 8 },
    packaging: ['CARTON', 'FOIL'],
    minQuantity: 30_000,
  },
};

export type ArtworkRules = {
  acceptedMimeTypes: readonly string[];
  maxSizeBytes: number;
  /** Relative difference of aspect ratios (image vs panel) above which the UI warns about distortion. */
  aspectRatioTolerance: number;
};

export const ARTWORK_RULES: ArtworkRules = {
  acceptedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  maxSizeBytes: 20 * 1024 * 1024,
  aspectRatioTolerance: 0.05,
};

/** Max length of a single Pantone colour entry, e.g. "PMS 186 C". */
export const PANTONE_CODE_MAX_LENGTH = 32;
