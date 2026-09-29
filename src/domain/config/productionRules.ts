// Production (construction) constants of the block-bottom bag.
// TODO(domain-architect): merge into productCatalog.ts once the parallel catalog edits settle.

/**
 * Client production rule (2026-09): every tube wall (FRONT, BACK, LEFT, RIGHT) extends below the bottom fold line
 * by a bottom allowance of (depth + BOTTOM_ALLOWANCE_EXTRA_MM) / 2 — this paper forms the block bottom.
 * See `getBottomAllowance` in `src/domain/geometry/tube.ts`.
 */
export const BOTTOM_ALLOWANCE_EXTRA_MM = 30;

export type DielineRules = {
  /** Longitudinal glue flap `s` (docs/PRODUCTION.md §9.2). Default 20 mm, range 15–25 mm — TO BE CONFIRMED. */
  glueFlap: { defaultWidth: number; min: number; max: number };
  /** Position of the longitudinal seam on BACK as a fraction of the width (0.5 = centre of BACK, §9.1). */
  seamOffsetRatio: number;
  /** Bleed beyond the cut lines (top, tube end, left sheet edge), mm (§9.4). */
  bleed: number;
  /** Colour overlap across a crease onto the neighbouring panel, mm (§9.4). */
  creaseOverprint: number;
  /** Safety margin from the top cut and from the bottom line, mm (§9.4). */
  safetyFromTopAndBottom: number;
  /** Safety margin from vertical creases and the seam, mm (§9.4). */
  safetyFromCreases: number;
  /** On LEFT/RIGHT critical content stays above the rhombus: y ≥ D/2 + this, mm (§4, §9.4). */
  sideSafetyAboveRhombus: number;
  /** Width of the glue strip of the bottom flaps, measured from the tube end (FRONT and BACK), mm (§9.3). */
  bottomFlapGlue: number;
  /**
   * Handle reinforcement patch fallback when the handle entity has no patch (§5, §9.5):
   * length Lp = min(maxLength, W − sideClearance), height Hp, top edge `topOffset` below the top cut.
   */
  handlePatch: { maxLength: number; sideClearance: number; height: number; topOffset: number };
};

export const DIELINE_RULES: DielineRules = {
  glueFlap: { defaultWidth: 20, min: 15, max: 25 },
  seamOffsetRatio: 0.5,
  bleed: 3,
  creaseOverprint: 2,
  safetyFromTopAndBottom: 6,
  safetyFromCreases: 5,
  sideSafetyAboveRhombus: 5,
  bottomFlapGlue: 30,
  handlePatch: { maxLength: 170, sideClearance: 20, height: 45, topOffset: 3 },
};

/** Limits of the artwork positioning module (CUSTOM placement). */
export const ARTWORK_PLACEMENT_RULES = {
  /** Scale relative to the "contain" fit. */
  minScale: 0.05,
  maxScale: 10,
  /** Keyboard / button steps. */
  nudgeMm: 1,
  nudgeLargeMm: 10,
  scaleStep: 1.1,
} as const;
