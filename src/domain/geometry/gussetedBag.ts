// Gusseted bag with a fold-over bottom ("torba fałdowa") — construction geometry and opening kinematics in mm. Pure TS.
// Source: docs/PRODUCTION.md §13 — client guideline "Torba fałdowa – wytyczne techniczne" (30.09.2026) [K] for the
// construction, docs/research/promar-gusseted-bag-bags.md §6–§7 for the opening shape [Z].
//
// Construction [K]: a tube of FRONT (W), two side gussets (F — `depth` —, each tucked inwards by F/2 along its centre
// crease) and BACK (W), closed by the longitudinal seam on the BACK / LEFT tube edge (like the block bottom, client
// decision 30.09.2026; the flap is glued inside LEFT's half next to BACK). There is no block bottom: the flattened
// tube end (all layers, gussets included) is folded 180° TO THE BACK by the bottom strip `d`
// (GUSSETED_BAG_RULES.bottomFoldDepth, here `b`) and glued. The top edge is cut straight (serrated: not in the MVP).
//
// Panel-local coordinates are those of every wall (`tube.ts`): seen from outside, origin at the bottom-left corner of
// the visible wall, the bottom fold line is y = 0, the fold strip below it y ∈ [−b, 0]. Panel x runs around the bag
// in sheet order LEFT → FRONT → RIGHT → BACK: FRONT x = 0 at the LEFT edge, RIGHT x = 0 at the FRONT edge, BACK x = 0
// at the RIGHT edge, LEFT x = 0 at the BACK edge.
//
// Bag frame (mm): origin at the centre of the bottom fold line, x to the RIGHT wall, y up, z to the FRONT — the same
// axes as the block-bottom renderer (FRONT +Z, BACK −Z, LEFT −X, RIGHT +X).
//
// Opening (research §7.3): `open` ∈ [0, 1] (0 = folded flat, 1 = mouth fully open to W × D). At height y each gusset
// half turns by α(y) = open · π/2 · s(y) away from the FRONT / BACK plane, where s rises smoothly from 0 at the glued
// bottom fold (y = b; the strip glued on the BACK keeps y ≤ b flat) to 1 at y = b + y_r, y_r = min(k·D, H/2).
// FRONT and BACK stay flat across the width and move apart to ±(D/2)·sin α; the gusset centre crease moves out from
// D/2 inside the side edge (flat) to the side edge itself (open). The walls are ruled surfaces (horizontal generators);
// the small stretch of the paper along y is ignored (research §7.3, negligible for D ≪ H).

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
  return Math.max(0, Math.min(d, dimensions.height / 2));
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

/** Height above the bottom fold over which the gussets open from flat to fully open: y_r = min(k·D, H/2, H − b). */
export function getGussetOpeningRise(dimensions: Pick<GussetedDimensions, 'height' | 'depth' | 'bottomFold'>): number {
  const b = getBottomFoldDepth(dimensions);
  return Math.max(0, Math.min(GUSSETED_BAG_RULES.openingRiseFactor * dimensions.depth, dimensions.height / 2, dimensions.height - b));
}

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge1 <= edge0) return value >= edge1 ? 1 : 0;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Angle of the gusset halves to the FRONT / BACK plane at height y (radians, 0 = flat, π/2 = fully open). */
export function getGussetAngle(dimensions: Dimensions, y: number, open: number): number {
  const b = getBottomFoldDepth(dimensions);
  return clamp01(open) * (Math.PI / 2) * smoothstep(b, b + getGussetOpeningRise(dimensions), y);
}

/**
 * Half-distance of FRONT and BACK from the bag's centre plane at height y: (D/2)·sin α(y), plus `gap` scaled by
 * (1 − sin α) so the flat layers never coincide (render-only paper thickness; 0 = exact geometry).
 */
export function getWallOffset(dimensions: Dimensions, y: number, open: number, gap = 0): number {
  const sin = Math.sin(getGussetAngle(dimensions, y, open));
  return (dimensions.depth / 2) * sin + gap * (1 - sin);
}

/** Wall point at height y ≥ 0 (above the bottom fold line) in the bag frame. */
function wallPoint(dimensions: Dimensions, panel: PanelPosition, x: number, y: number, open: number, gap: number): Vec3 {
  const { width: W, depth: D } = dimensions;
  const alpha = getGussetAngle(dimensions, y, open);
  const zf = getWallOffset(dimensions, y, open, gap);
  const inset = (D / 2) * Math.cos(alpha); // how far the gusset centre crease lies inside the side edge
  switch (panel) {
    case 'FRONT':
      return { x: -W / 2 + x, y, z: zf };
    case 'BACK':
      return { x: W / 2 - x, y, z: -zf };
    case 'RIGHT':
    case 'LEFT': {
      // Along the gusset from its FRONT edge: t ∈ [0, 1] to the centre crease, then [1, 2] on to the BACK edge.
      const fromFront = panel === 'RIGHT' ? x : D - x;
      const t = D > 0 ? (2 * fromFront) / D : 0;
      const side = panel === 'RIGHT' ? 1 : -1;
      const reach = t <= 1 ? t : 2 - t; // 0 at the side edges, 1 at the crease
      const z = t <= 1 ? zf * (1 - t) : -zf * (t - 1);
      return { x: side * (W / 2 - inset * reach), y, z };
    }
  }
}

/**
 * Position of a panel-local point in the bag frame, mm. y ≥ 0: the wall; y ∈ [−b, 0): the fold-over strip, folded 180°
 * about the bottom fold line onto the BACK [K] (it stays flat — the gussets are glued shut there): the layer order from
 * the BACK wall outwards is BACK strip, gusset strips, FRONT strip (outermost, its print side visible on the back).
 * `gap` = render-only layer separation in mm (see `getWallOffset`). `stripTurn` ∈ [0, 1] is how far the strip has been
 * folded (0 = still hanging below the flat tube, 1 = folded onto the BACK; the forming timeline, gussetedAssembly.ts,
 * turns it with the bag flat, open = 0).
 */
export function getGussetedPoint(
  dimensions: Dimensions,
  panel: PanelPosition,
  point: { x: number; y: number },
  open: number,
  gap = 0,
  stripTurn = 1,
): Vec3 {
  if (point.y >= 0) return wallPoint(dimensions, panel, point.x, point.y, open, gap);
  // Flat position of the strip (α = 0 below the glued fold), then a turn by θ = π·stripTurn about the axis (y = 0,
  // z = −1.5·gap) towards the back; at θ = π: (y, z) → (−y, −3·gap − z). BACK (z = −gap) lands at −2·gap, FRONT
  // (z = gap) at −4·gap (outermost on the back). The layers stay concentric about the axis, so they never cross.
  const flat = wallPoint(dimensions, panel, point.x, 0, 0, gap);
  if (stripTurn >= 1) return { x: flat.x, y: -point.y, z: -3 * gap - flat.z };
  const theta = Math.PI * clamp01(stripTurn);
  const zc = -1.5 * gap;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const dz = flat.z - zc;
  return { x: flat.x, y: c * point.y - s * dz, z: zc + s * point.y + c * dz };
}

/** Panel-local extent including the fold strip: x ∈ [0, panel width], y ∈ [−b, H]. */
export function getGussetedPanelBounds(position: PanelPosition, dimensions: Dimensions) {
  const { width, height } = getPanelSize(position, dimensions);
  return { minX: 0, maxX: width, minY: -getBottomFoldDepth(dimensions), maxY: height };
}

/** Mouth (top edge) opening at `open`: FRONT–BACK distance, mm (D when fully open, 0 when flat, without the gap). */
export function getMouthDepth(dimensions: Dimensions, open: number): number {
  return 2 * getWallOffset(dimensions, dimensions.height, open);
}
