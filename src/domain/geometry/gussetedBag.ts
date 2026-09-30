// Gusseted bag with a fold-over bottom ("torba fałdowa") — construction geometry in mm. Pure TS. The forming from the
// sheet, the fold-over bottom and the opening of the bag (3D preview): gussetedAssembly.ts.
// Source: docs/PRODUCTION.md §13 — client guideline "Torba fałdowa – wytyczne techniczne" (30.09.2026) [K].
//
// Construction [K]: a tube of FRONT (W), two side gussets (F — `depth` —, each tucked inwards by F/2 along its centre
// crease) and BACK (W), closed by the longitudinal seam on the BACK / LEFT tube edge (like the block bottom, client
// decision 30.09.2026; the flap is glued inside LEFT's half next to BACK). There is no block bottom: the flattened
// tube end (all layers, gussets included) is folded 180° TO THE BACK by the bottom strip `d`
// (GUSSETED_BAG_RULES.bottomFoldDepth or the configured value, here `b`) and glued. The top edge is cut straight
// (serrated: not in the MVP).
//
// Panel-local coordinates are those of every wall (`tube.ts`): seen from outside, origin at the bottom-left corner of
// the visible wall, the bottom fold line is y = 0, the fold strip below it y ∈ [−b, 0]. Panel x runs around the bag
// in sheet order LEFT → FRONT → RIGHT → BACK: FRONT x = 0 at the LEFT edge, RIGHT x = 0 at the FRONT edge, BACK x = 0
// at the RIGHT edge, LEFT x = 0 at the BACK edge.
//
// Bag frame (mm): origin at the centre of the bottom fold line, x to the RIGHT wall, y up, z to the FRONT — the same
// axes as the block-bottom renderer (FRONT +Z, BACK −Z, LEFT −X, RIGHT +X).

import { GUSSETED_BAG_RULES } from '../config/productCatalog';
import { getPanelSize } from '../panels';
import type { Dimensions, PanelPosition } from '../types';

export type Vec3 = { x: number; y: number; z: number };

/**
 * Gusseted-bag dimensions as the geometry takes them: W, H, F plus the configured bottom strip d (`bottomFold`, mm;
 * absent = the default `GUSSETED_BAG_RULES.bottomFoldDepth`).
 */
export type GussetedDimensions = Dimensions & { bottomFold?: number };

/** Bottom strip `d` of the fold-over bottom, mm (configured or default; never more than half the bag height). */
export function getBottomFoldDepth(dimensions: Pick<GussetedDimensions, 'height' | 'bottomFold'>): number {
  const d = dimensions.bottomFold ?? GUSSETED_BAG_RULES.bottomFoldDepth;
  const h = Number.isFinite(dimensions.height) ? dimensions.height : 0;
  return Number.isFinite(d) ? Math.max(0, Math.min(d, h / 2)) : 0;
}

/** Recommended gusset F for a width W [K]: 0.4·W … 0.7·W, in mm (the hard maximum is F ≤ W). */
export function getRecommendedGussetRange(width: number): { min: number; max: number } {
  const { min, max } = GUSSETED_BAG_RULES.recommendedGussetRatio;
  return { min: min * width, max: max * width };
}

/** True when the gusset lies outside the recommended 0.4–0.7·W (tolerance 1e-9 mm). */
export function isGussetOutsideRecommended({ width, depth }: Pick<Dimensions, 'width' | 'depth'>): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(depth) || width <= 0) return false;
  const { min, max } = getRecommendedGussetRange(width);
  return depth < min - 1e-9 || depth > max + 1e-9;
}

/** Cut length of the tube: H + b (single fold-over bottom). */
export function getGussetedCutLength(dimensions: Pick<GussetedDimensions, 'height' | 'bottomFold'>): number {
  return dimensions.height + getBottomFoldDepth(dimensions);
}

/** Panel-local extent including the fold strip: x ∈ [0, panel width], y ∈ [−b, H]. */
export function getGussetedPanelBounds(position: PanelPosition, dimensions: GussetedDimensions) {
  const { width, height } = getPanelSize(position, dimensions);
  return { minX: 0, maxX: width, minY: -getBottomFoldDepth(dimensions), maxY: height };
}
