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
  },
};

/**
 * Per-type handle defaults (everything except the generated id), mm. Client rules [K] (docs/PRODUCTION.md §5): the
 * flat strip is 20 mm wide and the patch is 110 × 20 mm for both types (90 mm handle + 10 mm overhang each side) (its position: DIELINE_RULES.handlePatch).
 * Rope Ø and loop length are preview values. Both types are strong kraft glued inside under the patch.
 */
export const HANDLE_DEFAULTS: Record<HandleType, Omit<Handle, 'id' | 'type'>> = {
  FLAT_PAPER: { material: 'KRAFT', color: '#c8a57a', width: 20, length: 180, patch: { width: 110, height: 20 } },
  TWISTED_PAPER: { material: 'KRAFT', color: '#c8a57a', width: 5, length: 180, patch: { width: 110, height: 20 } },
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

/**
 * Suggested on-screen preview colours for common Pantone (solid coated) inks, keyed by the normalised code
 * (upper case, without the "PMS" / "PANTONE" prefix). Approximate sRGB values — the user can always change them.
 */
export const PANTONE_PREVIEW_SUGGESTIONS: Readonly<Record<string, string>> = {
  'BLACK C': '#2d2926',
  'WHITE': '#ffffff',
  'YELLOW C': '#fedd00',
  '109 C': '#ffd100',
  '021 C': '#fe5000',
  'ORANGE 021 C': '#fe5000',
  'WARM RED C': '#f9423a',
  '485 C': '#da291c',
  '186 C': '#c8102e',
  'RUBINE RED C': '#ce0058',
  '2685 C': '#330072',
  'REFLEX BLUE C': '#001489',
  '300 C': '#005eb8',
  'PROCESS BLUE C': '#0085ca',
  'GREEN C': '#00ab84',
  '354 C': '#00b140',
  'COOL GRAY 11 C': '#53565a',
  '877 C': '#8a8d8f',
  '871 C': '#84754e',
};

/** Distinct fallback preview colours for codes without a suggestion (first one not yet used is taken). */
export const PANTONE_FALLBACK_PREVIEW_COLORS: readonly string[] = [
  '#2d2926',
  '#c8102e',
  '#005eb8',
  '#ffd100',
  '#00ab84',
  '#fe5000',
  '#330072',
  '#8a8d8f',
];

/** Ink-coverage estimate (docs/SPEC.md §4d). Distances are CIE76 ΔE*ab. */
export const PRINT_COVERAGE_RULES = {
  /** Pixels with alpha below this (0–255) carry no ink; above it ink is weighted by alpha. */
  minAlpha: 8,
  /** On WHITE paper, a pixel within this ΔE of paper white (#ffffff) is unprinted paper, not ink. */
  nearWhiteDeltaE: 8,
  /** A pixel farther than this from its nearest Pantone preview still counts for it but raises a hint. */
  poorMatchDeltaE: 30,
  /** Share of ink (0–1) that must be poorly matched before the hint is shown. */
  poorMatchHintShare: 0.1,
  /** Sampling grid of each wall: cells along its longer side. */
  gridCellsLongSide: 256,
  /** Artwork is decoded once per file into a canvas of at most this many px on the long side. */
  sampleMaxSidePx: 256,
} as const;

/**
 * Colours actually present in the placed artwork (docs/SPEC.md §4d, "Kolory w grafikach"). Ink pixels are sampled
 * like the ink coverage (same rules above), binned, merged agglomeratively in CIELAB (CIEDE2000) with the
 * user-set `ColorAnalysisSettings`; see `artworkPalette.ts` for the algorithm.
 */
export const ARTWORK_PALETTE_RULES = {
  /** Histogram resolution: bits kept per sRGB channel (5 → 32 768 bins); lowered automatically for photos. */
  binBits: 5,
  /** Upper bound of non-empty bins entering the agglomerative merge (bits are reduced until it holds). */
  maxWorkingBins: 512,
  /** At most this many colours are listed; the rest is reported as "other". */
  maxColors: 16,
  /**
   * Anti-aliasing: a shade within this sRGB distance (0–255 per channel, Euclidean) of the straight segment between
   * two larger colours (or a colour and the white paper) is a blend of them and goes to the nearer one.
   */
  edgeMaxDistance: 12,
  /** …only when its area is at most this fraction of the smaller of the two colours (a real third colour is larger). */
  edgeMaxAreaRatio: 0.1,
  /** A colour under the minimum share is absorbed by the nearest listed colour within `tolerance × this` ΔE00. */
  minorAbsorbFactor: 2,
} as const;

/** Defaults of `PrintSpec.colorAnalysis` (client decision 29.09.2026: merge similar colours). */
export const COLOR_ANALYSIS_DEFAULTS = {
  /** CIEDE2000 ΔE00 — ≈ 10 merges JPEG noise, gradients of one ink and anti-aliasing, keeps distinct inks apart. */
  mergeTolerance: 10,
  /** 0.5 % of the total ink. */
  minAreaShare: 0.005,
} as const;

/** UI / normalisation limits of `PrintSpec.colorAnalysis`. */
export const COLOR_ANALYSIS_LIMITS = {
  mergeTolerance: { min: 0, max: 30, step: 1 },
  minAreaShare: { min: 0, max: 0.05 },
  /** Options of the "minimum spot size" select (share of the total ink). */
  minAreaShareOptions: [0, 0.001, 0.0025, 0.005, 0.01, 0.02] as readonly number[],
} as const;

/**
 * Preview colour of the bare paper (sRGB hex) — the single source for the 3D paper material and for flattening
 * transparent artwork onto the paper in the PDF exports (approximation of the stock, not a print specification).
 */
export const PAPER_PREVIEW_COLORS: Record<PaperColor, string> = {
  WHITE: '#f4f2ec',
  BROWN: '#b88a5a',
};
