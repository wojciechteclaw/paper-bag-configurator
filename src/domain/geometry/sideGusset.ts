// Side-gusset crease geometry and fold kinematics of a block-bottom bag (docs/SPEC.md §4a).
// Pure 2D maths in millimetres — no React, no Three.js. Future die-line output will reuse these helpers.
//
// Panel-local coordinates of a LEFT/RIGHT side panel (depth × height), seen from OUTSIDE the bag:
//   origin = bottom-left corner, x ∈ [0, depth] to the right, y ∈ [0, height] upwards.
//
//   (0,H) ┌────┬────┐ (D,H)
//         │    │    │
//         │ L  │  R │     centre crease x = D/2, from the apex to the top
//         │    │    │
//         │   / \   │  ← apex (D/2, D/2)
//         │ /  T  \ │     45° creases from the bottom corners to the apex
//   (0,0) └─────────┘ (D,0)
//
// L/R/T is the coarse split of SPEC §4a; `blockBottom.ts` refines L into SIDE_BACK_UPPER / SIDE_BACK_LOWER
// (pleat y = D/2, docs/PRODUCTION.md §3.3). Fold state (`foldProgress`) is VIEW state, never in BagConfiguration.

import type { Dimensions } from '../types';

export type Point2 = { x: number; y: number };
export type Segment2 = { from: Point2; to: Point2 };
/** Convex polygon, vertices counter-clockwise as seen from outside the bag. */
export type Polygon2 = readonly Point2[];

export type SideRegionId = 'L' | 'R' | 'T';

export type SidePanelCreases = {
  /** Vertical centre crease from the apex to the top edge. */
  centre: Segment2;
  /** 45° crease from the bottom-left corner (0,0) to the apex. */
  left: Segment2;
  /** 45° crease from the bottom-right corner (D,0) to the apex. */
  right: Segment2;
};

type SideDimensions = Pick<Dimensions, 'depth' | 'height'>;

/**
 * Apex where the three creases meet: (D/2, D/2). The y value is clamped to the panel height so invalid input
 * (height < depth/2, excluded by the catalog ranges) still yields a closed, non-overlapping tiling.
 */
export function getSidePanelApex({ depth, height }: SideDimensions): Point2 {
  return { x: depth / 2, y: Math.min(depth / 2, height) };
}

export function getSidePanelCreases(dimensions: SideDimensions): SidePanelCreases {
  const { depth, height } = dimensions;
  const apex = getSidePanelApex(dimensions);
  return {
    centre: { from: apex, to: { x: depth / 2, y: height } },
    left: { from: { x: 0, y: 0 }, to: apex },
    right: { from: { x: depth, y: 0 }, to: apex },
  };
}

/** Regions L, R, T that tile the side panel exactly (CCW polygons, panel-local mm). */
export function getSidePanelRegions(dimensions: SideDimensions): Record<SideRegionId, Polygon2> {
  const { depth, height } = dimensions;
  const apex = getSidePanelApex(dimensions);
  return {
    L: [{ x: 0, y: 0 }, apex, { x: depth / 2, y: height }, { x: 0, y: height }],
    R: [apex, { x: depth, y: 0 }, { x: depth, y: height }, { x: depth / 2, y: height }],
    T: [{ x: 0, y: 0 }, { x: depth, y: 0 }, apex],
  };
}

/** Signed polygon area (shoelace); positive for counter-clockwise vertex order. */
export function polygonArea(polygon: Polygon2): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

// Fold kinematics (ψ, φ, g, θ as functions of foldProgress, docs/PRODUCTION.md §10.5) live in `foldKinematics.ts`;
// the full crease/region model incl. the flat-fold pleat and the block bottom lives in `blockBottom.ts`.
