// Production (construction) constants of the block-bottom bag.
// TODO(domain-architect): merge into productCatalog.ts once the parallel catalog edits settle.

/**
 * Client production rule (2026-09): every tube wall (FRONT, BACK, LEFT, RIGHT) extends below the bottom fold line
 * by a bottom allowance of (depth + BOTTOM_ALLOWANCE_EXTRA_MM) / 2 — this paper forms the block bottom.
 * See `getBottomAllowance` in `src/domain/geometry/tube.ts`.
 */
export const BOTTOM_ALLOWANCE_EXTRA_MM = 30;
