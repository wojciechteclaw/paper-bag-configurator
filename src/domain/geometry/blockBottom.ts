// Crease and region layout of a block-bottom (SOS) bag — docs/PRODUCTION.md §3.3–3.4, §10.1–10.4.
// Pure 2D geometry in millimetres. No React, no Three.js. Shared by the 3D fold preview and (later) production output.
//
// Panel-local coordinates (docs/PRODUCTION.md §3.1), every panel seen from OUTSIDE, origin bottom-left, y up:
//   FRONT  W × H, x = 0 at the LEFT edge        RIGHT  D × H, x = 0 at the FRONT edge
//   BACK   W × H, x = 0 at the RIGHT edge       LEFT   D × H, x = 0 at the BACK edge
//   BOTTOM W × D, seen from BELOW: x like FRONT (LEFT → RIGHT), y = 0 on the back bottom crease, y = D on the front one.
// The visible wall is y ∈ [0, H]; the bottom zone (allowance) E = a = (D + 30)/2 hangs below it (y ∈ [−E, 0)) and,
// once folded, forms the BOTTOM (client model [K]: side zones fold in whole, FRONT / BACK zones fold as trapezoids with
// 45° creases — see "Block bottom" below). Polygons are convex and counter-clockwise as seen from outside.

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
  /** Visible 45° crease of a FRONT / BACK bottom trapezoid seen from below (the "X" of the formed bottom). */
  | 'BOTTOM_TRAPEZOID_DIAGONAL'
  /** Visible end edge of the outer (BACK) trapezoid = the glue seam seen from below (client rule [K]: back on top). */
  | 'BOTTOM_FLAP_SEAM';

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

// ——— Polygon helpers ———

/** Drops consecutive (and closing) duplicate vertices, e.g. the collapsed end of a degenerate trapezoid. */
export function dedupePolygon(polygon: Polygon2, tolerance = 1e-9): Polygon2 {
  const out: Point2[] = [];
  for (const p of polygon) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > tolerance) out.push(p);
  }
  while (out.length > 1 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= tolerance) {
    out.pop();
  }
  return out;
}

/**
 * Clips a convex polygon to the half-plane n · p ≤ c (Sutherland–Hodgman); keeps the vertex order. May return fewer
 * than 3 vertices (empty intersection).
 */
export function clipConvexPolygon(polygon: Polygon2, n: Point2, c: number): Polygon2 {
  const out: Point2[] = [];
  const side = (p: Point2) => n.x * p.x + n.y * p.y - c;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const sa = side(a);
    const sb = side(b);
    if (sa <= 0) out.push(a);
    if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) {
      const t = sa / (sa - sb);
      out.push(pt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t));
    }
  }
  return dedupePolygon(out);
}

/** Intersection of a convex polygon with several half-planes n · p ≤ c. */
export function clipConvexPolygonAll(polygon: Polygon2, halfPlanes: readonly (readonly [Point2, number])[]): Polygon2 {
  return halfPlanes.reduce((poly, [n, c]) => (poly.length >= 3 ? clipConvexPolygon(poly, n, c) : poly), polygon);
}

const ccw = (polygon: Polygon2): Polygon2 => (polygonArea(polygon) < 0 ? [...polygon].reverse() : polygon);

// ——— Block bottom: the four bottom zones (client model [K], docs/PRODUCTION.md §3.4) ———
//
// Every wall has a bottom zone of depth E = (D + 30)/2 below its bottom line (panel-local y ∈ [−E, 0]).
//   LEFT / RIGHT (D × E): no crease inside — the whole zone turns 90° in on the bottom line ("side flap").
//   FRONT / BACK (W × E): two 45° creases from the bottom-line corners, (0,0)→(E,−E) and (W,0)→(W−E,−E) — a trapezoid
//     (W at the bottom line, W − 2E at the zone end) and two corner triangles ("ears") outside the diagonals.
// Forming (client order [K]): sides in → FRONT trapezoid → BACK trapezoid on top (glue overlap OV = 2E − D = 30 mm).
// An ear is joined to the neighbouring side zone along the tube corner edge (C2 / C3 continued into the zone). When the
// side zone turns in, that edge swings from vertical onto the wall's bottom line, so the ear turns 180° over its
// diagonal and lies on the INSIDE of its own trapezoid; the trapezoid then carries it onto the bottom. Stack from the
// inside of the bag outwards: side flaps → FRONT ears → FRONT trapezoid → BACK ears → BACK trapezoid.
// Needs W ≥ 2E = D + 30; below that the diagonals meet at t = W/2 before the zone end (trapezoid → triangle, ears
// become quadrilaterals) — `isBottomTrapezoidDegenerate`, domain warning BOTTOM_TRAPEZOID_DEGENERATE.

/** Depth of the trapezoid (where its 45° creases end): min(E, W/2) — E normally, W/2 when W < D + 30. */
export function getBottomTrapezoidDepth(d: Pick<Dimensions, 'width' | 'depth'>): number {
  return Math.max(0, Math.min(getBottomAllowance(d), d.width / 2));
}

/** W < 2E = D + 30: the trapezoid of the FRONT / BACK bottom zone degenerates into a triangle. */
export function isBottomTrapezoidDegenerate(d: Pick<Dimensions, 'width' | 'depth'>): boolean {
  return d.width < 2 * getBottomAllowance(d) - 1e-9;
}

export type BottomZonePieceId =
  /** FRONT / BACK: the trapezoid between the 45° creases (visible from below). */
  | 'TRAPEZOID'
  /** FRONT / BACK: corner triangle at panel x = 0 (turns 180° over its diagonal onto the trapezoid's inside). */
  | 'EAR_START'
  /** FRONT / BACK: corner triangle at panel x = W. */
  | 'EAR_END'
  /** LEFT / RIGHT: the whole D × E zone (turns 90° in on the bottom line, no crease inside). */
  | 'SIDE_FLAP';

export type BottomZonePiece = { id: BottomZonePieceId; polygon: Polygon2 };

/**
 * Pieces of a wall's bottom zone in panel-local mm (y ∈ [−E, 0]), CCW seen from the print side; they tile the zone
 * exactly. Degenerate FRONT / BACK zones (W < 2E) end the diagonals at t = W/2: trapezoid → triangle, the ears are
 * quadrilaterals meeting on x = W/2.
 */
export function getBottomZonePieces(panel: PanelPosition, d: Pick<Dimensions, 'width' | 'depth'>): BottomZonePiece[] {
  const { width: W, depth: D } = d;
  const E = getBottomAllowance(d);
  if (panel === 'LEFT' || panel === 'RIGHT') return [{ id: 'SIDE_FLAP', polygon: rect(0, -E, D, 0) }];
  const m = getBottomTrapezoidDepth(d);
  return [
    { id: 'TRAPEZOID', polygon: dedupePolygon([pt(0, 0), pt(m, -m), pt(W - m, -m), pt(W, 0)]) },
    { id: 'EAR_START', polygon: dedupePolygon([pt(0, 0), pt(0, -E), pt(m, -E), pt(m, -m)]) },
    { id: 'EAR_END', polygon: dedupePolygon([pt(W - m, -m), pt(W - m, -E), pt(W, -E), pt(W, 0)]) },
  ];
}

/** The 45° creases of a FRONT / BACK bottom zone (panel-local), from the bottom-line corners to the trapezoid end. */
export function getBottomZoneDiagonals(d: Pick<Dimensions, 'width' | 'depth'>): [Segment2, Segment2] {
  const m = getBottomTrapezoidDepth(d);
  const W = d.width;
  return [seg(pt(0, 0), pt(m, -m)), seg(pt(W, 0), pt(W - m, -m))];
}

// ——— The formed bottom seen from below (BOTTOM-local, docs/PRODUCTION.md §10.4) ———

export type BottomPieceId =
  | 'BACK_TRAPEZOID'
  | 'BACK_EAR_LEFT'
  | 'BACK_EAR_RIGHT'
  | 'FRONT_TRAPEZOID'
  | 'FRONT_EAR_LEFT'
  | 'FRONT_EAR_RIGHT'
  | 'SIDE_FLAP_LEFT'
  | 'SIDE_FLAP_RIGHT';

/**
 * One layer of the formed block bottom, i.e. one piece of a wall's bottom zone (panel-local y ∈ [−E, 0]).
 * `toPanel` maps BOTTOM-local (seen from below) to that wall's panel-local mm (inverse: `fromPanel`), so the wall's
 * continuous UV space (u = x / panelWidth, v = y / H, v < 0 in the zone) continues onto the piece.
 */
export type BottomPiece = {
  id: BottomPieceId;
  /** The wall whose bottom zone forms this piece. */
  panel: PanelPosition;
  /** The piece of that zone (`getBottomZonePieces`). */
  zonePiece: BottomZonePieceId;
  /**
   * Paper layer counted from the OUTSIDE of the bottom (client rule [K]): 0 BACK trapezoid (outermost), 1 BACK ears,
   * 2 FRONT trapezoid, 3 FRONT ears, 4 side flaps (innermost) — the side flaps lie under both trapezoids.
   */
  layer: number;
  /** BOTTOM-local, counter-clockwise seen from below. */
  polygon: Polygon2;
  toPanel: (p: Point2) => Point2;
  fromPanel: (p: Point2) => Point2;
  /**
   * Whether the printed (outer) side of the wall faces down/outwards on this piece. Trapezoids and side flaps turn 90°
   * on their bottom line (printed side out); the ears turn a further 180° over the 45° creases (printed side in).
   */
  printedSideOut: boolean;
};

type PointMap = (p: Point2) => Point2;

/**
 * Zone point ↔ BOTTOM-local for every piece (docs/PRODUCTION.md §10.4): the trapezoids hinge on the front / back bottom
 * crease, the side flaps on the side bottom lines; an ear is its trapezoid's map after the reflection over its diagonal.
 */
function bottomMaps(d: Pick<Dimensions, 'width' | 'depth'>): Record<BottomPieceId, { from: PointMap; to: PointMap }> {
  const { width: W, depth: D } = d;
  const pair = (from: PointMap, to: PointMap) => ({ from, to });
  return {
    FRONT_TRAPEZOID: pair((p) => pt(p.x, p.y + D), (p) => pt(p.x, p.y - D)),
    BACK_TRAPEZOID: pair((p) => pt(W - p.x, -p.y), (p) => pt(W - p.x, -p.y)),
    SIDE_FLAP_LEFT: pair((p) => pt(-p.y, p.x), (p) => pt(p.y, -p.x)),
    SIDE_FLAP_RIGHT: pair((p) => pt(W + p.y, D - p.x), (p) => pt(D - p.y, p.x - W)),
    FRONT_EAR_LEFT: pair((p) => pt(-p.y, D - p.x), (p) => pt(D - p.y, -p.x)),
    FRONT_EAR_RIGHT: pair((p) => pt(W + p.y, p.x - W + D), (p) => pt(W - D + p.y, p.x - W)),
    BACK_EAR_RIGHT: pair((p) => pt(W + p.y, p.x), (p) => pt(p.y, p.x - W)),
    BACK_EAR_LEFT: pair((p) => pt(-p.y, W - p.x), (p) => pt(W - p.y, -p.x)),
  };
}

const BOTTOM_PIECE_SOURCES: readonly { id: BottomPieceId; panel: PanelPosition; zonePiece: BottomZonePieceId; layer: number }[] = [
  { id: 'BACK_TRAPEZOID', panel: 'BACK', zonePiece: 'TRAPEZOID', layer: 0 },
  // BACK x = 0 is at RIGHT: its start ear sits at the RIGHT corner.
  { id: 'BACK_EAR_RIGHT', panel: 'BACK', zonePiece: 'EAR_START', layer: 1 },
  { id: 'BACK_EAR_LEFT', panel: 'BACK', zonePiece: 'EAR_END', layer: 1 },
  { id: 'FRONT_TRAPEZOID', panel: 'FRONT', zonePiece: 'TRAPEZOID', layer: 2 },
  { id: 'FRONT_EAR_LEFT', panel: 'FRONT', zonePiece: 'EAR_START', layer: 3 },
  { id: 'FRONT_EAR_RIGHT', panel: 'FRONT', zonePiece: 'EAR_END', layer: 3 },
  { id: 'SIDE_FLAP_LEFT', panel: 'LEFT', zonePiece: 'SIDE_FLAP', layer: 4 },
  { id: 'SIDE_FLAP_RIGHT', panel: 'RIGHT', zonePiece: 'SIDE_FLAP', layer: 4 },
];

/** All bottom-zone pieces of the formed bottom, outermost first (BACK trapezoid … side flaps). */
export function getBottomPieces(d: Pick<Dimensions, 'width' | 'depth'>): BottomPiece[] {
  const maps = bottomMaps(d);
  return BOTTOM_PIECE_SOURCES.map(({ id, panel, zonePiece, layer }) => {
    const zone = getBottomZonePieces(panel, d).find((z) => z.id === zonePiece)!;
    const { from, to } = maps[id];
    return {
      id,
      panel,
      zonePiece,
      layer,
      polygon: ccw(zone.polygon.map(from)),
      toPanel: to,
      fromPanel: from,
      printedSideOut: zonePiece === 'TRAPEZOID' || zonePiece === 'SIDE_FLAP',
    };
  });
}

/** A piece as seen from below: the convex parts of it that no outer layer covers (BOTTOM-local, CCW). */
export type VisibleBottomPiece = BottomPiece & { visibleParts: Polygon2[] };

/**
 * What is seen of the formed bottom from below (docs/PRODUCTION.md §3.4.2 [K]): the BACK trapezoid (outermost), the
 * part of the FRONT trapezoid it leaves free, and the two side triangles (0,0),(D/2,D/2),(0,D) and mirror — the side
 * flaps between the trapezoid diagonals ("X"). Together they tile the W × D bottom exactly; the ears are always
 * hidden (tucked between the side flaps and the trapezoids).
 */
export function getVisibleBottomPieces(d: Pick<Dimensions, 'width' | 'depth'>): VisibleBottomPiece[] {
  const { width: W, depth: D } = d;
  const m = getBottomTrapezoidDepth(d);
  const pieces = Object.fromEntries(getBottomPieces(d).map((p) => [p.id, p])) as Record<BottomPieceId, BottomPiece>;
  const keep = (parts: Polygon2[]) => parts.filter((p) => p.length >= 3 && polygonArea(p) > 1e-9);
  const front = pieces.FRONT_TRAPEZOID.polygon;
  // Outside the BACK trapezoid = beyond its end (y ≥ m) or beyond one of its diagonals (x ≤ y, x ≥ W − y).
  const frontParts = keep([
    clipConvexPolygonAll(front, [[pt(0, -1), -m]]),
    clipConvexPolygonAll(front, [[pt(0, 1), m], [pt(1, -1), 0]]),
    clipConvexPolygonAll(front, [[pt(0, 1), m], [pt(-1, -1), -W]]),
  ]);
  // Side triangle: left of both diagonals, x ≤ y and x ≤ D − y (also for W < 2E, as long as D ≤ W).
  const sideLeft = keep([clipConvexPolygonAll(pieces.SIDE_FLAP_LEFT.polygon, [[pt(1, -1), 0], [pt(1, 1), D]])]);
  const sideRight = keep([clipConvexPolygonAll(pieces.SIDE_FLAP_RIGHT.polygon, [[pt(-1, -1), -W], [pt(-1, 1), D - W]])]);
  return [
    { ...pieces.BACK_TRAPEZOID, visibleParts: [pieces.BACK_TRAPEZOID.polygon] },
    { ...pieces.FRONT_TRAPEZOID, visibleParts: frontParts },
    { ...pieces.SIDE_FLAP_LEFT, visibleParts: sideLeft },
    { ...pieces.SIDE_FLAP_RIGHT, visibleParts: sideRight },
  ];
}

/**
 * Lines seen on the underside of the formed bottom (BOTTOM-local): the BACK trapezoid's 45° creases and its end edge
 * y = E (the glue seam, client rule [K]: back on top), and the visible halves of the FRONT trapezoid's 45° creases up
 * to the side-triangle tips (D/2, D/2). Together with the outline they draw the "X" of the client's view from below.
 * The outline itself (front/back bottom creases, side bottom lines) is the panel boundary and is not listed.
 */
export function getBottomCreases(d: Pick<Dimensions, 'width' | 'depth'>): Crease[] {
  const { width: W, depth: D } = d;
  const m = getBottomTrapezoidDepth(d);
  const h = D / 2;
  const creases: Crease[] = [
    { kind: 'BOTTOM_TRAPEZOID_DIAGONAL', segment: seg(pt(0, 0), pt(m, m)) },
    { kind: 'BOTTOM_TRAPEZOID_DIAGONAL', segment: seg(pt(W, 0), pt(W - m, m)) },
    { kind: 'BOTTOM_TRAPEZOID_DIAGONAL', segment: seg(pt(0, D), pt(h, h)) },
    { kind: 'BOTTOM_TRAPEZOID_DIAGONAL', segment: seg(pt(W, D), pt(W - h, h)) },
  ];
  if (W - 2 * m > 1e-9) creases.push({ kind: 'BOTTOM_FLAP_SEAM', segment: seg(pt(m, m), pt(W - m, m)) });
  return creases;
}

/**
 * Parts of a wall's bottom zone that are visible from below on the formed bag, in panel-local mm (y ∈ [−E, 0]):
 * BACK — the whole trapezoid, FRONT — the part the BACK trapezoid leaves free, LEFT / RIGHT — the side triangle
 * (D/2 deep); the ears are never visible. Tells which printed colours of the zone show on the finished bottom.
 */
export function getVisibleBottomZoneParts(panel: PanelPosition, d: Pick<Dimensions, 'width' | 'depth'>): Polygon2[] {
  return getVisibleBottomPieces(d)
    .filter((piece) => piece.panel === panel)
    .flatMap((piece) => piece.visibleParts.map((part) => ccw(part.map(piece.toPanel))));
}
