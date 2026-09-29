import type {
  BagType,
  Dimensions,
  Handle,
  HandleType,
  HandleVariant,
  PackagingType,
  PaperColor,
  PaperType,
  PrintTechnology,
} from '../types';

export type Range = { min: number; max: number };

/** Dimensions are entered in 5 mm increments. */
export const DIMENSION_STEP_MM = 5;

export type DimensionLimits = Record<keyof Dimensions, Range>;

/** Selectable grammages: min..max in `step` increments (g/m²). */
export type GrammageOptions = Range & { default: number; step: number };

/** Size class used by the manufacturer to group standard sizes (małe / średnie / duże / XL). */
export type StandardSizeClass = 'S' | 'M' | 'L' | 'XL';

/** A catalogue (standard) bag size. `id` is unique within one handle variant. */
export type StandardSize = {
  id: string;
  dimensions: Dimensions;
  sizeClass?: StandardSizeClass;
};

/**
 * What can be ordered for one handle variant. Paper types, grammage range, moisture barrier and standard sizes
 * differ between "no handle", "internal flat handle" and "internal twisted handle" in the reference offer.
 */
export type HandleVariantDefinition = {
  variant: HandleVariant;
  /** Allowed paper types, in UI order. */
  paperTypes: PaperType[];
  /** Used when the current paper type is not allowed (e.g. after switching the handle variant). */
  defaultPaperType: PaperType;
  grammage: GrammageOptions;
  moistureBarrierAvailable: boolean;
  /** Only sizes actually published by the manufacturer; may be empty. */
  standardSizes: StandardSize[];
  /** Capacity range published by the manufacturer (informational), litres. */
  capacityLitres?: Range;
};

export type BagTypeDefinition = {
  type: BagType;
  available: boolean;
  defaultDimensions: Dimensions;
  limits: DimensionLimits;
  /** Handle variants in UI order; must contain `NONE`. Supported handle types are derived from it. */
  handleVariants: HandleVariantDefinition[];
  paperColors: PaperColor[];
  print: { technologies: PrintTechnology[]; maxColors: number };
  packaging: PackagingType[];
  minQuantity: number;
};

const size = (width: number, depth: number, height: number, sizeClass?: StandardSizeClass): StandardSize => ({
  id: `${width}x${depth}x${height}`,
  dimensions: { width, depth, height },
  ...(sizeClass ? { sizeClass } : {}),
});

// Sources (verified 2026-09 on the manufacturer's pages):
// - Main page: https://www.promarjarocin.pl/torby-klockowe/ — width 75–260 mm, height 170–430 mm, paper colour
//   white / brown, flexo up to 8 Pantone, FSC® available, minimum run 30 000 pcs.
// - No handle: https://www.promarjarocin.pl/torby-klockowe/bez-uchwytu/ — 50–120 g/m²; kraft, recycled, film-coated,
//   coated, greaseproof; optional moisture barrier. Standard sizes (W×D×H) from 80×45×220 to 320×220×400; only the
//   end points of each size class are published, so only those are listed.
// - Internal flat handle: https://www.promarjarocin.pl/torby-klockowe-z-uchwytem-wewnetrznym/ — flat paper handle
//   glued inside (strong multi-fold kraft, reinforced with a paper patch); 70–110 g/m²; kraft or recycled; 3–40 l.
// - Internal twisted handle: https://www.promarjarocin.pl/torby-klockowe/z-uchwytem-wewnetrznym-skrecanym/ —
//   twisted paper handle glued inside (strong kraft + paper patch); 70–120 g/m²; single-ply kraft or recycled;
//   3–30 l; no size table.
// TODO: depth range is not published — 40–300 mm is a placeholder to confirm with production.
// TODO: the flat-handle size table goes up to 450×170×470, beyond the main page's width/height limits
//   (see docs/SPEC.md §8). Those sizes are listed but not selectable until the limits are confirmed.
// TODO: grammage step 10 g/m² is an assumption (docs/SPEC.md §8).
const BLOCK_HANDLE_VARIANTS: HandleVariantDefinition[] = [
  {
    variant: 'NONE',
    paperTypes: ['KRAFT', 'RECYCLED', 'COATED', 'FILM_COATED', 'GREASEPROOF'],
    defaultPaperType: 'KRAFT',
    grammage: { min: 50, max: 120, default: 80, step: 10 },
    moistureBarrierAvailable: true,
    standardSizes: [
      size(80, 45, 220, 'S'),
      size(110, 60, 270, 'S'),
      size(120, 70, 200, 'M'),
      size(160, 90, 230, 'M'),
      size(180, 110, 260, 'L'),
      size(220, 110, 300, 'L'),
      size(250, 140, 400, 'XL'),
      size(320, 220, 400, 'XL'),
    ],
  },
  {
    variant: 'FLAT_PAPER',
    paperTypes: ['KRAFT', 'RECYCLED'],
    defaultPaperType: 'KRAFT',
    grammage: { min: 70, max: 110, default: 80, step: 10 },
    moistureBarrierAvailable: false,
    standardSizes: [
      size(180, 85, 230),
      size(250, 110, 280),
      size(200, 140, 400),
      size(280, 170, 280),
      size(320, 110, 400),
      size(350, 170, 400),
      size(450, 170, 470),
    ],
    capacityLitres: { min: 3, max: 40 },
  },
  {
    variant: 'TWISTED_PAPER',
    paperTypes: ['KRAFT', 'RECYCLED'],
    defaultPaperType: 'KRAFT',
    grammage: { min: 70, max: 120, default: 80, step: 10 },
    moistureBarrierAvailable: false,
    standardSizes: [],
    capacityLitres: { min: 3, max: 30 },
  },
];

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
    handleVariants: BLOCK_HANDLE_VARIANTS,
    paperColors: ['BROWN', 'WHITE'],
    print: { technologies: ['FLEXO'], maxColors: 8 },
    packaging: ['CARTON', 'FOIL'],
    minQuantity: 30_000,
  },
  // Not available yet — placeholder data so the type is selectable once geometry exists.
  FOLDED: {
    type: 'FOLDED',
    available: false,
    defaultDimensions: { width: 200, height: 400, depth: 150 },
    limits: {
      width: { min: 75, max: 260 },
      height: { min: 170, max: 430 },
      depth: { min: 40, max: 300 },
    },
    handleVariants: [{ ...BLOCK_HANDLE_VARIANTS[0], standardSizes: [] }],
    paperColors: ['BROWN', 'WHITE'],
    print: { technologies: ['FLEXO'], maxColors: 8 },
    packaging: ['CARTON', 'FOIL'],
    minQuantity: 30_000,
  },
};

/**
 * Per-type handle defaults (everything except the generated id). Dimensions in mm are placeholders for the
 * preview until production confirms them; both types are strong kraft glued inside with a paper patch.
 */
export const HANDLE_DEFAULTS: Record<HandleType, Omit<Handle, 'id' | 'type'>> = {
  FLAT_PAPER: { material: 'KRAFT', color: '#c8a57a', width: 15, length: 180, patch: { width: 80, height: 50 } },
  TWISTED_PAPER: { material: 'KRAFT', color: '#c8a57a', width: 5, length: 180, patch: { width: 80, height: 50 } },
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
