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
// Fold state (`foldProgress`) is VIEW state and never part of BagConfiguration.

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

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

export type SideGussetFoldState = {
  /** Fold angle θ = foldProgress · 90°, radians. */
  angle: number;
  /** Distance between the (planar) front and back walls: D · cos θ. */
  frontBackDistance: number;
  /** How far the centre crease has moved into the bag from the side plane: (D/2) · sin θ. */
  creaseInset: number;
};

/** Kinematics of the side gusset for `foldProgress` ∈ [0, 1] (clamped; 0 = open box, 1 = folded flat). */
export function getSideGussetFoldState(depth: number, foldProgress: number): SideGussetFoldState {
  const angle = (clamp01(foldProgress) * Math.PI) / 2;
  return {
    angle,
    frontBackDistance: depth * Math.cos(angle),
    creaseInset: (depth / 2) * Math.sin(angle),
  };
}

/**
 * Position of a point of the rigid region L or R after folding, in the horizontal "gusset plane" of the side:
 * - `inset`: distance from the (unfolded) side plane towards the bag centre, ≥ 0;
 * - `along`: signed position along the front–back axis, measured from the mid-plane between the walls,
 *   positive towards the wall hinged at panel-local x = 0.
 * L hinges on the wall at x = 0, R on the wall at x = D; both hinge on each other at the centre crease.
 * Height (y) is unchanged by the side fold. Region T is not rigid in this model (it folds with the bottom,
 * see docs/PRODUCTION.md) and is therefore not handled here.
 */
export function foldSideRegionPoint(
  region: 'L' | 'R',
  x: number,
  depth: number,
  foldProgress: number,
): { inset: number; along: number } {
  const { angle, frontBackDistance } = getSideGussetFoldState(depth, foldProgress);
  const half = frontBackDistance / 2;
  // Distance of the point from the region's own hinge edge (wall edge), measured inside the rigid region.
  const fromHinge = region === 'L' ? x : depth - x;
  const inset = fromHinge * Math.sin(angle);
  const towardsCentre = half - fromHinge * Math.cos(angle);
  return { inset, along: region === 'L' ? towardsCentre : -towardsCentre };
}
