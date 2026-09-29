// Crease and region layout of a block-bottom (SOS) bag — docs/PRODUCTION.md §3.3–3.4, §10.1–10.4.
// Pure 2D geometry in millimetres. No React, no Three.js. Shared by the 3D fold preview and (later) production output.
//
// Panel-local coordinates (docs/PRODUCTION.md §3.1), every panel seen from OUTSIDE, origin bottom-left, y up:
//   FRONT  W × H, x = 0 at the LEFT edge        RIGHT  D × H, x = 0 at the FRONT edge
//   BACK   W × H, x = 0 at the RIGHT edge       LEFT   D × H, x = 0 at the BACK edge
//   BOTTOM W × D, seen from BELOW: x like FRONT (LEFT → RIGHT), y = 0 on the back bottom crease, y = D on the front one.
// The visible wall is y ∈ [0, H]; the bottom allowance a = (D + 30)/2 hangs below it (y ∈ [−a, 0)) and, once folded,
// forms the BOTTOM. Polygons are convex and counter-clockwise as seen from outside.

import type { Dimensions, PanelPosition } from '../types';
import { polygonArea, type Point2, type Polygon2, type Segment2 } from './sideGusset';
import { getBottomAllowance } from './tube';

/** Flap overlap of the block bottom: 2a − D (= the 30 mm client extra, docs/PRODUCTION.md §3.2). */
export function getBottomFlapOverlap(dimensions: Pick<Dimensions, 'depth'>): number {
  return 2 * getBottomAllowance(dimensions) - dimensions.depth;
}

/** Rigid (or vertex-driven) parts of the folding bag, docs/PRODUCTION.md §10. */
export type FoldRegionId =
  | 'FRONT'
  | 'BACK_UPPER'
  | 'BACK_LOWER'
  | 'SIDE_FRONT'
  | 'SIDE_BACK_UPPER'
  | 'SIDE_BACK_LOWER'
  | 'SIDE_T'
  | 'BOTTOM';

export type FoldPanelId = PanelPosition | 'BOTTOM';

export type PanelRegion = { id: FoldRegionId; polygon: Polygon2 };

export type CreaseKind =
  /** Vertical centre crease of a side gusset, from the apex up to the top edge (valley). */
  | 'SIDE_CENTRE'
  /** 45° crease from the bottom corner at the FRONT edge to the apex. */
  | 'SIDE_DIAGONAL_FRONT'
  /** 45° crease from the bottom corner at the BACK edge to the apex. */
  | 'SIDE_DIAGONAL_BACK'
  /** Horizontal flat-fold pleat y = D/2 (whole BACK, back half of each side). */
  | 'FLAT_FOLD_PLEAT'
  /** Tuck-triangle edges on the bottom (lower half of the diamond, the ears fold over them). */
  | 'BOTTOM_TUCK_DIAGONAL'
  /** Centre crease between the two ears of a side allowance (x = D/2 on the bottom). */
  | 'BOTTOM_EAR_CENTRE'
  /** Visible cut edge of the outer (front) bottom flap = the glue seam seen from below. */
  | 'BOTTOM_FLAP_SEAM'
  /** Cut edge of the inner (back) bottom flap, hidden under the front flap (overlap boundary). */
  | 'BOTTOM_FLAP_OVERLAP';

export type Crease = { kind: CreaseKind; segment: Segment2 };

type Dims = Pick<Dimensions, 'width' | 'height' | 'depth'>;

const pt = (x: number, y: number): Point2 => ({ x, y });
const seg = (from: Point2, to: Point2): Segment2 => ({ from, to });

/** Half depth h = D/2, clamped to the height so invalid input (H < D/2, excluded by the catalog) never crashes. */
function halfDepth({ depth, height }: Pick<Dimensions, 'depth' | 'height'>): number {
  return Math.max(0, Math.min(depth / 2, height));
}

/** Mirror of a side-panel polygon x → D − x (LEFT ↔ RIGHT); vertex order is reversed to stay counter-clockwise. */
function mirrorPolygon(polygon: Polygon2, depth: number): Polygon2 {
  return polygon.map((p) => pt(depth - p.x, p.y)).reverse();
}

function mirrorSegment(s: Segment2, depth: number): Segment2 {
  return seg(pt(depth - s.from.x, s.from.y), pt(depth - s.to.x, s.to.y));
}

function rect(x0: number, y0: number, x1: number, y1: number): Polygon2 {
  return [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1)];
}

/** LEFT side panel regions (x = 0 at BACK), docs/PRODUCTION.md §10.3. */
function leftSideRegions(d: Dims): PanelRegion[] {
  const D = d.depth;
  const H = d.height;
  const h = halfDepth(d);
  return [
    { id: 'SIDE_FRONT', polygon: [pt(h, h), pt(D, 0), pt(D, H), pt(h, H)] },
    { id: 'SIDE_BACK_UPPER', polygon: [pt(0, h), pt(h, h), pt(h, H), pt(0, H)] },
    { id: 'SIDE_BACK_LOWER', polygon: [pt(0, 0), pt(h, h), pt(0, h)] },
    { id: 'SIDE_T', polygon: [pt(0, 0), pt(D, 0), pt(h, h)] },
  ];
}

/** LEFT side panel creases (x = 0 at BACK), docs/PRODUCTION.md §10.3. */
function leftSideCreases(d: Dims): Crease[] {
  const D = d.depth;
  const h = halfDepth(d);
  return [
    { kind: 'SIDE_CENTRE', segment: seg(pt(h, h), pt(h, d.height)) },
    { kind: 'SIDE_DIAGONAL_BACK', segment: seg(pt(0, 0), pt(h, h)) },
    { kind: 'SIDE_DIAGONAL_FRONT', segment: seg(pt(D, 0), pt(h, h)) },
    { kind: 'FLAT_FOLD_PLEAT', segment: seg(pt(0, h), pt(h, h)) },
  ];
}

/**
 * Regions of the visible wall (y ∈ [0, H]) of a panel, or of the BOTTOM (one rigid W × D region in the animation).
 * They tile the panel exactly and share its continuous UV space (artwork breaks on the creases only when folded).
 */
export function getPanelRegions(panel: FoldPanelId, d: Dims): PanelRegion[] {
  const { width: W, height: H, depth: D } = d;
  const h = halfDepth(d);
  switch (panel) {
    case 'FRONT':
      return [{ id: 'FRONT', polygon: rect(0, 0, W, H) }];
    case 'BACK':
      return [
        { id: 'BACK_LOWER', polygon: rect(0, 0, W, h) },
        { id: 'BACK_UPPER', polygon: rect(0, h, W, H) },
      ];
    case 'BOTTOM':
      return [{ id: 'BOTTOM', polygon: rect(0, 0, W, D) }];
    case 'LEFT':
      return leftSideRegions(d);
    case 'RIGHT':
      return leftSideRegions(d).map((r) => ({ id: r.id, polygon: mirrorPolygon(r.polygon, D) }));
  }
}

/**
 * Crease segments inside the visible wall of a panel (the perimeter bottom fold line y = 0 and the tube edges are
 * panel boundaries, not listed here). FRONT has none; BACK has the flat-fold pleat y = D/2; each side has the centre
 * crease, two 45° creases and the pleat on its BACK half (the extra horizontal crease, docs/PRODUCTION.md §3.3).
 */
export function getPanelCreases(panel: PanelPosition, d: Dims): Crease[] {
  const h = halfDepth(d);
  switch (panel) {
    case 'FRONT':
      return [];
    case 'BACK':
      return [{ kind: 'FLAT_FOLD_PLEAT', segment: seg(pt(0, h), pt(d.width, h)) }];
    case 'LEFT':
      return leftSideCreases(d);
    case 'RIGHT':
      return leftSideCreases(d).map((c) => ({ kind: c.kind, segment: mirrorSegment(c.segment, d.depth) }));
  }
}

/**
 * Layers of the folded block bottom in BOTTOM-local coordinates (seen from below), docs/PRODUCTION.md §3.4.2, §10.4.
 * Order from the inside of the bag outwards: tucks → ears → back flap → front flap.
 */
export type BottomLayout = {
  outline: Polygon2;
  /** Outer flap (allowance of FRONT), y ∈ [D − a, D]. */
  frontFlap: Polygon2;
  /** Inner flap (allowance of BACK), y ∈ [0, a]. */
  backFlap: Polygon2;
  /** Glue overlap of the flaps, y ∈ [D − a, a] (30 mm). */
  overlap: Polygon2;
  /** Inner tuck triangles (allowances of LEFT / RIGHT turned in on the side bottom line). */
  tucks: Record<'LEFT' | 'RIGHT', Polygon2>;
  /** Ears folded back by 180° over the 45° creases, under the flaps. */
  ears: Record<'LEFT_BACK' | 'LEFT_FRONT' | 'RIGHT_BACK' | 'RIGHT_FRONT', Polygon2>;
};

/** Mirror of a BOTTOM polygon x → W − x (LEFT ↔ RIGHT side of the bag), still counter-clockwise. */
function mirrorBottom(polygon: Polygon2, width: number): Polygon2 {
  return polygon.map((p) => pt(width - p.x, p.y)).reverse();
}

export function getBottomLayout(d: Pick<Dimensions, 'width' | 'depth'>): BottomLayout {
  const { width: W, depth: D } = d;
  const a = Math.min(getBottomAllowance(d), D);
  const h = D / 2;
  const leftTuck: Polygon2 = [pt(0, 0), pt(h, h), pt(0, D)];
  const earBack: Polygon2 = [pt(0, 0), pt(h, h), pt(h, a), pt(0, a)];
  const earFront: Polygon2 = [pt(0, D), pt(0, D - a), pt(h, D - a), pt(h, h)];
  // earFront listed as in PRODUCTION §10.4; normalise to counter-clockwise.
  const ccw = (p: Polygon2) => (polygonArea(p) < 0 ? [...p].reverse() : p);
  return {
    outline: rect(0, 0, W, D),
    frontFlap: rect(0, D - a, W, D),
    backFlap: rect(0, 0, W, a),
    overlap: rect(0, D - a, W, a),
    tucks: { LEFT: leftTuck, RIGHT: mirrorBottom(leftTuck, W) },
    ears: {
      LEFT_BACK: ccw(earBack),
      LEFT_FRONT: ccw(earFront),
      RIGHT_BACK: mirrorBottom(ccw(earBack), W),
      RIGHT_FRONT: mirrorBottom(ccw(earFront), W),
    },
  };
}

/**
 * Lines on the underside of the formed bottom (BOTTOM-local): the visible flap seam y = D − a, the hidden edge of
 * the back flap y = a (together they bound the 30 mm glue overlap), the tuck-triangle diagonals (the 45° creases of
 * the side allowances, lower half of the diamond) and the ear centre creases x = D/2 between the flaps.
 * The outline itself (front/back bottom creases, side bottom lines) is the panel boundary and is not listed.
 */
export function getBottomCreases(d: Pick<Dimensions, 'width' | 'depth'>): Crease[] {
  const { width: W, depth: D } = d;
  const a = Math.min(getBottomAllowance(d), D);
  const h = D / 2;
  const left: Crease[] = [
    { kind: 'BOTTOM_TUCK_DIAGONAL', segment: seg(pt(0, 0), pt(h, h)) },
    { kind: 'BOTTOM_TUCK_DIAGONAL', segment: seg(pt(0, D), pt(h, h)) },
    { kind: 'BOTTOM_EAR_CENTRE', segment: seg(pt(h, D - a), pt(h, a)) },
  ];
  const right = left.map((c) => ({
    kind: c.kind,
    segment: seg(pt(W - c.segment.from.x, c.segment.from.y), pt(W - c.segment.to.x, c.segment.to.y)),
  }));
  return [
    { kind: 'BOTTOM_FLAP_SEAM', segment: seg(pt(0, D - a), pt(W, D - a)) },
    { kind: 'BOTTOM_FLAP_OVERLAP', segment: seg(pt(0, a), pt(W, a)) },
    ...left,
    ...right,
  ];
}

/** Inclusive point-in-convex-polygon test (CCW polygon), tolerance in mm. */
export function pointInConvexPolygon(p: Point2, polygon: Polygon2, tolerance = 1e-6): boolean {
  return polygon.every((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / len >= -tolerance;
  });
}

/** First region containing the point (inclusive), e.g. to decide which rigid part carries a crease line. */
export function findRegion(regions: readonly PanelRegion[], p: Point2): PanelRegion | undefined {
  return regions.find((r) => pointInConvexPolygon(p, r.polygon));
}
