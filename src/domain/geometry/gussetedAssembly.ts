// Gusseted bag (FOLDED): forming from the printed sheet as on the machine, then opening — one continuous rigid-facet
// kinematics in millimetres, pure TS (docs/SPEC.md §4i, docs/PRODUCTION.md §13.6). Client guideline [K] 30.09.2026.
//
// Timeline t ∈ [0, 1] of the gusseted preview (its own mapping; the block bottom keeps assemblyKinematics.ts):
//
//   TUCK    t ∈ [0.0, 0.2]  tucking knives: both gussets pleat in by F/2 — the tube edges FRONT|RF, FRONT|LF fold 180°
//                           (out), the gusset centres 180° back (in); RB / LB end up parallel to FRONT, BACK + seam
//                           flap slide along flat with RB
//   WRAP    t ∈ [0.2, 0.4]  BACK wraps 180° behind on the RIGHT|BACK edge; the seam flap folds onto BACK's inside first
//                           (C3), so BACK lands with the flap under LB's free edge: seam closed on the BACK|LEFT edge
//   BOTTOM  t ∈ [0.4, 0.6]  the bottom strip d (every layer, flap included) folds 180° TO THE BACK on the bottom line;
//                           t = 0.6 is the finished flat bag as it leaves the machine
//   OPEN    t ∈ [0.6, 1.0]  use: the bag opens to the mouth W × F (t = 1)
//
// Frame (mm) as the rest of the gusseted geometry: origin at the centre of the bottom fold line, x to the RIGHT wall,
// y up, z to the FRONT. The sheet (LEFT | FRONT | RIGHT | BACK | s, buildGussetedDieline) lies in z = 0 with its print
// side to +z and FRONT at x ∈ [−W/2, W/2]; FRONT never moves before the opening. Panel-local coordinates are the
// dieline's (seen from outside, x with the sheet, y = 0 on the bottom fold line, strip y ∈ [−d, 0]); the flap uses
// u ∈ [0, s] from its hinge.
//
// Open bag (replaces the smooth S-profile): the band y ∈ [0, d] above the fold stays flat (glued bottom). Above that
// "seal line" FRONT and BACK are planar and hinge on it, tilting to ±z_f (φ = asin(z_f / (H − d))), so the side view
// is a wedge (the bag does not stand). Each gusset half splits along its diagonal from the mouth corner b of its tube
// edge to the crease point e on the seal line: the EDGE triangle (tube edge, seal, diagonal) stays folded against the
// inside of its wall and tilts with it; the CREASE triangle (diagonal, crease, top edge) is placed rigidly through b,
// e and the crease top c, solved from |bc| = F/2 (top edge) and |ec| = H − d (crease) on the bag's centre plane. At
// z_f = F/2 c is the side edge: the mouth is exactly W × F. Every facet is rigid (an exact isometry of the sheet) and
// every hinge is closed at every t (tests). The height of the open bag is d + √((H − d)² − z_f²).
//
// Render-only paper layers: `getGussetedLayerSteps` gives each facet an offset along its print-side normal in steps
// (the renderer multiplies by ≤ 0.1 mm): flat tube front → back FRONT, LF / RF, LB / RB, BACK with the flap half a
// step between LB and BACK; the folded strips stack outside BACK with FRONT's strip outermost.

import { clipConvexPolygon } from './blockBottom';
import { getBottomFoldDepth, type GussetedDimensions, type Vec3 } from './gussetedBag';
import { polygonArea, type Point2, type Polygon2 } from './sideGusset';

// ——— Pieces ———

/** Rigid links of the sheet while the tube forms: FRONT, the four gusset halves, BACK and the seam flap. */
export type GussetedLink = 'FRONT' | 'RF' | 'RB' | 'BACK' | 'GLUE' | 'LB' | 'LF';
/** Facets of a link: strip below the fold line, band up to the seal line, the wall above (walls: UPPER, gusset halves and flap: EDGE + CREASE triangles). */
export type GussetedPart = 'STRIP' | 'BAND' | 'UPPER' | 'EDGE' | 'CREASE';
export type GussetedPieceId = `${GussetedLink}_${GussetedPart}`;
/** Sheet column of a piece (the flap is its own column after BACK). */
export type GussetedSheetColumn = 'LEFT' | 'FRONT' | 'RIGHT' | 'BACK' | 'GLUE';

export type GussetedPiece = {
  id: GussetedPieceId;
  link: GussetedLink;
  part: GussetedPart;
  column: GussetedSheetColumn;
  /** Panel-local mm (flap: u from its hinge, y), counter-clockwise seen from the print side. */
  polygon: Polygon2;
  /** Below the bottom fold line (y ≤ 0): the bottom strip d. */
  strip: boolean;
};

const HALVES = ['RF', 'RB', 'LB', 'LF'] as const;
type Half = (typeof HALVES)[number];

type Dims = Pick<GussetedDimensions, 'width' | 'height' | 'depth' | 'bottomFold'>;

const pt = (x: number, y: number): Point2 => ({ x, y });
const rect = (x0: number, y0: number, x1: number, y1: number): Polygon2 => [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1)];
const ccw = (polygon: Polygon2): Polygon2 => (polygonArea(polygon) < 0 ? [...polygon].reverse() : polygon);

/** Seam flap width used in 3D: the dieline's s, at most F/2 (it lies inside LB, the gusset half next to BACK). */
export function getGussetedFlapWidth(d: Pick<Dims, 'depth'>, glueFlapWidth: number): number {
  return Math.max(0, Math.min(Number.isFinite(glueFlapWidth) ? glueFlapWidth : 0, d.depth / 2));
}

/** Sheet x of each column's panel-local x = 0 (LEFT | FRONT | RIGHT | BACK | flap, as `buildGussetedDieline`). */
export function getGussetedSheetOrigins(d: Pick<Dims, 'width' | 'depth'>): Record<GussetedSheetColumn, number> {
  const { width: W, depth: F } = d;
  return { LEFT: 0, FRONT: F, RIGHT: F + W, BACK: 2 * F + W, GLUE: 2 * F + 2 * W };
}

/** Half → its column, x range, tube-edge x and crease x (panel-local). LEFT x = 0 and RIGHT x = F are at BACK. */
function halfGeometry(half: Half, F: number) {
  switch (half) {
    case 'RF':
      return { column: 'RIGHT' as const, x0: 0, x1: F / 2, edge: 0 };
    case 'RB':
      return { column: 'RIGHT' as const, x0: F / 2, x1: F, edge: F };
    case 'LB':
      return { column: 'LEFT' as const, x0: 0, x1: F / 2, edge: 0 };
    case 'LF':
      return { column: 'LEFT' as const, x0: F / 2, x1: F, edge: F };
  }
}

/**
 * The rigid facets of the sheet (they tile it exactly): per wall strip / band / upper; per gusset half strip / band /
 * EDGE / CREASE triangle; the seam flap cut along LB's diagonal the same way (it is glued to LB).
 */
export function getGussetedPieces(d: Dims, glueFlapWidth: number): GussetedPiece[] {
  const { width: W, height: H, depth: F } = d;
  const b = getBottomFoldDepth(d);
  const s = getGussetedFlapWidth(d, glueFlapWidth);
  const pieces: GussetedPiece[] = [];
  const add = (link: GussetedLink, part: GussetedPart, column: GussetedSheetColumn, polygon: Polygon2) => {
    if (polygon.length < 3 || Math.abs(polygonArea(polygon)) <= 1e-9) return;
    pieces.push({ id: `${link}_${part}`, link, part, column, polygon: ccw(polygon), strip: part === 'STRIP' });
  };
  for (const wall of ['FRONT', 'BACK'] as const) {
    add(wall, 'UPPER', wall, rect(0, b, W, H));
    add(wall, 'BAND', wall, rect(0, 0, W, b));
  }
  for (const half of HALVES) {
    const { column, x0, x1, edge } = halfGeometry(half, F);
    const crease = F / 2;
    add(half, 'EDGE', column, [pt(edge, b), pt(edge, H), pt(crease, b)]);
    add(half, 'CREASE', column, [pt(edge, H), pt(crease, H), pt(crease, b)]);
    add(half, 'BAND', column, rect(x0, 0, x1, b));
  }
  if (s > 0) {
    // LB's diagonal from (0, H) to (F/2, b): EDGE side x·(H − b) + (F/2)·(y − H) ≤ 0.
    const n = pt(H - b, F / 2);
    const c = (F / 2) * H;
    const upper = rect(0, b, s, H);
    add('GLUE', 'EDGE', 'GLUE', clipConvexPolygon(upper, n, c));
    add('GLUE', 'CREASE', 'GLUE', clipConvexPolygon(upper, pt(-n.x, -n.y), -c));
    add('GLUE', 'BAND', 'GLUE', rect(0, 0, s, b));
  }
  if (b > 0) {
    for (const wall of ['FRONT', 'BACK'] as const) add(wall, 'STRIP', wall, rect(0, -b, W, 0));
    for (const half of HALVES) {
      const { column, x0, x1 } = halfGeometry(half, F);
      add(half, 'STRIP', column, rect(x0, -b, x1, 0));
    }
    if (s > 0) add('GLUE', 'STRIP', 'GLUE', rect(0, -b, s, 0));
  }
  return pieces;
}

// ——— Timeline ———

export type GussetedPhaseId = 'TUCK' | 'WRAP' | 'BOTTOM' | 'OPEN';

/** Phases on the gusseted preview timeline (client order [K]: production first, then use). */
export const GUSSETED_PHASES: Readonly<Record<GussetedPhaseId, readonly [number, number]>> = {
  TUCK: [0, 0.2],
  WRAP: [0.2, 0.4],
  BOTTOM: [0.4, 0.6],
  OPEN: [0.6, 1],
};

/** Timeline value of the finished flat bag (end of production, start of the opening). */
export const GUSSETED_PRODUCTION_SHARE = GUSSETED_PHASES.BOTTOM[1];

const PHASE_IDS = Object.keys(GUSSETED_PHASES) as GussetedPhaseId[];

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);
const smooth = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

/** Linear progress 0..1 of every phase at timeline t. */
export function getGussetedPhaseProgress(timeline: number): Record<GussetedPhaseId, number> {
  const t = clamp01(timeline);
  const out = {} as Record<GussetedPhaseId, number>;
  for (const id of PHASE_IDS) {
    const [from, to] = GUSSETED_PHASES[id];
    out[id] = clamp01((t - from) / (to - from));
  }
  return out;
}

/** The phase running at t (its start inclusive); t = 1 → OPEN. */
export function getGussetedPhase(timeline: number): GussetedPhaseId {
  const t = clamp01(timeline);
  return PHASE_IDS.find((id) => t < GUSSETED_PHASES[id][1]) ?? 'OPEN';
}

/**
 * Timeline → the renderer props shared with the block bottom: `assemblyProgress` = production (sheet → finished flat
 * bag), `foldProgress` = 1 − opening (1 = flat, 0 = open; the same meaning as the block bottom's fold, so the
 * snapshots' fold values work unchanged). q < 1 ⇒ p = 1.
 */
export function splitGussetedTimeline(timeline: number): { assemblyProgress: number; foldProgress: number } {
  const t = clamp01(timeline);
  const share = GUSSETED_PRODUCTION_SHARE;
  if (t < share) return { assemblyProgress: t / share, foldProgress: 1 };
  return { assemblyProgress: 1, foldProgress: 1 - (t - share) / (1 - share) };
}

/** Inverse of `splitGussetedTimeline`. */
export function toGussetedTimeline(assemblyProgress: number, foldProgress: number): number {
  const q = clamp01(assemblyProgress);
  const share = GUSSETED_PRODUCTION_SHARE;
  return q < 1 ? q * share : share + (1 - clamp01(foldProgress)) * (1 - share);
}

// ——— Rigid transforms ———

/** world = r · p + t (r row-major 3 × 3). */
export type RigidTransform = { r: readonly number[]; t: Vec3 };

const IDENTITY: RigidTransform = { r: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: { x: 0, y: 0, z: 0 } };

function mulR(a: readonly number[], b: readonly number[]): number[] {
  const out = new Array<number>(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) out[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  }
  return out;
}

const rotateVec = (r: readonly number[], v: Vec3): Vec3 => ({
  x: r[0] * v.x + r[1] * v.y + r[2] * v.z,
  y: r[3] * v.x + r[4] * v.y + r[5] * v.z,
  z: r[6] * v.x + r[7] * v.y + r[8] * v.z,
});

/** a ∘ b (b first). */
function compose(a: RigidTransform, b: RigidTransform): RigidTransform {
  const t = rotateVec(a.r, b.t);
  return { r: mulR(a.r, b.r), t: { x: t.x + a.t.x, y: t.y + a.t.y, z: t.z + a.t.z } };
}

/** Applies a rigid transform to a point (writes into `out`). */
export function applyGussetedRigid(m: RigidTransform, p: Vec3, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  const { x, y, z } = p;
  out.x = m.r[0] * x + m.r[1] * y + m.r[2] * z + m.t.x;
  out.y = m.r[3] * x + m.r[4] * y + m.r[5] * z + m.t.y;
  out.z = m.r[6] * x + m.r[7] * y + m.r[8] * z + m.t.z;
  return out;
}

/** Rotation about the x axis through (·, py, pz): +y turns towards +z for positive angles. */
function rotationX(angle: number, py = 0, pz = 0): RigidTransform {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const r = [1, 0, 0, 0, c, -s, 0, s, c];
  return { r, t: { x: 0, y: py - (c * py - s * pz), z: pz - (s * py + c * pz) } };
}

/**
 * A link of the forming tube: rotation about the vertical (y) axis by φ, so its local +x points along
 * (cos φ, 0, −sin φ) (φ > 0 turns behind the sheet, towards −z), with local x = xRef at (ox, ·, oz).
 */
function link(phi: number, xRef: number, ox: number, oz: number): RigidTransform {
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  const r = [c, 0, s, 0, 1, 0, -s, 0, c];
  return { r, t: { x: ox - c * xRef, y: 0, z: oz + s * xRef } };
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
function unit(a: Vec3): Vec3 {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}

/** The rigid motion taking the triangle (b0, c0, e0) onto the congruent triangle (b1, c1, e1). */
function triangleTransform(b0: Vec3, c0: Vec3, e0: Vec3, b1: Vec3, c1: Vec3, e1: Vec3): RigidTransform {
  const frame = (b: Vec3, c: Vec3, e: Vec3) => {
    const x = unit(sub(c, b));
    const n = unit(cross(sub(c, b), sub(e, b)));
    return [x, cross(n, x), n];
  };
  const [x0, y0, n0] = frame(b0, c0, e0);
  const [x1, y1, n1] = frame(b1, c1, e1);
  // R = F1 · F0ᵀ (columns x, y, n).
  const r = [
    x1.x * x0.x + y1.x * y0.x + n1.x * n0.x, x1.x * x0.y + y1.x * y0.y + n1.x * n0.y, x1.x * x0.z + y1.x * y0.z + n1.x * n0.z,
    x1.y * x0.x + y1.y * y0.x + n1.y * n0.x, x1.y * x0.y + y1.y * y0.y + n1.y * n0.y, x1.y * x0.z + y1.y * y0.z + n1.y * n0.z,
    x1.z * x0.x + y1.z * y0.x + n1.z * n0.x, x1.z * x0.y + y1.z * y0.y + n1.z * n0.y, x1.z * x0.z + y1.z * y0.z + n1.z * n0.z,
  ];
  const rb = rotateVec(r, b0);
  return { r, t: sub(b1, rb) };
}

// ——— Open bag ———

/** Largest mouth half-depth z_f: F/2 (mouth W × F), limited to 0.8·(H − d) for very short bags (the walls would lie down). */
export function getGussetedMaxMouthHalfDepth(d: Dims): number {
  const Hw = Math.max(0, d.height - getBottomFoldDepth(d));
  return Math.max(0, Math.min(d.depth / 2, 0.8 * Hw));
}

export type GussetedOpenShape = {
  /** Mouth half-depth z_f (FRONT top at +z_f, BACK top at −z_f), mm. */
  mouthHalfDepth: number;
  /** Tilt of FRONT / BACK above the seal line, radians. */
  tilt: number;
  /** Height of the mouth corners (top of the tube edges), mm. */
  topY: number;
  /** Crease top c of the RIGHT gusset (x, y) on the centre plane z = 0; LEFT is mirrored. */
  creaseTop: Point2;
};

/** Open-bag shape for a mouth half-depth z_f ∈ [0, max] (see the file comment). */
export function getGussetedOpenShape(d: Dims, mouthHalfDepth: number): GussetedOpenShape {
  const { width: W, height: H, depth: F } = d;
  const b = getBottomFoldDepth(d);
  const Hw = Math.max(0, H - b);
  const zf = Math.min(Math.max(0, Number.isFinite(mouthHalfDepth) ? mouthHalfDepth : 0), getGussetedMaxMouthHalfDepth(d));
  const tilt = Hw > 0 ? Math.asin(Math.min(1, zf / Hw)) : 0;
  const topY = b + Hw * Math.cos(tilt);
  // c: |c − e| = Hw around e = (W/2 − F/2, b) and |c − b_proj| = √(F²/4 − z_f²) around (W/2, topY), the intersection
  // left of e → b_proj (continuous with the flat solution (W/2 − F/2, H)).
  const p1 = pt(W / 2 - F / 2, b);
  const p2 = pt(W / 2, topY);
  const r1 = Hw;
  const r2 = Math.sqrt(Math.max(0, (F * F) / 4 - zf * zf));
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.hypot(dx, dy);
  let creaseTop = pt(W / 2 - F / 2, H);
  if (r2 <= 1e-9) {
    creaseTop = p2; // fully open: the crease top is the side edge (avoids the cancellation in √(r1² − a²))
  } else if (dist > 1e-12) {
    const a = (r1 * r1 - r2 * r2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
    creaseTop = pt(p1.x + (a * dx - h * dy) / dist, p1.y + (a * dy + h * dx) / dist);
  }
  return { mouthHalfDepth: zf, tilt, topY, creaseTop };
}

// ——— Pose ———

export type GussetedAngles = {
  /** Gusset pleat (tube edges FRONT|RF, FRONT|LF and the gusset centres), 0 → π. */
  tuck: number;
  /** BACK wrapped behind on the RIGHT|BACK edge, 0 → π. */
  wrap: number;
  /** Seam flap folded onto BACK's inside (C3), 0 → π. */
  flap: number;
  /** Bottom strip folded to the back, 0 → π. */
  bottom: number;
};

export type GussetedPose = {
  width: number;
  height: number;
  depth: number;
  bottomFold: number;
  glueFlapWidth: number;
  timeline: number;
  angles: GussetedAngles;
  open: GussetedOpenShape;
  /** Transform of every piece from its panel-local (x, y, 0) to the bag frame. */
  transforms: Record<GussetedPieceId, RigidTransform>;
  /** 0..1 fade of the render-only paper layers (in while the gussets tuck, so the sheet stays exactly flat). */
  layerFade: number;
  /** 0..1 progress of the strip's layer re-stacking behind BACK ((1 − cos θ) / 2). */
  stripStack: number;
  /**
   * Suggested view placement (render-only): the model x to centre (sheet centre → bag centre while BACK wraps) and
   * the lift that keeps the hanging strip on the floor (d, 0 once the strip is folded past horizontal).
   */
  view: { centreX: number; lift: number };
};

export function getGussetedPose(d: Dims, glueFlapWidth: number, timeline: number): GussetedPose {
  const { width: W, height: H, depth: F } = d;
  const b = getBottomFoldDepth(d);
  const s = getGussetedFlapWidth(d, glueFlapWidth);
  const t = clamp01(timeline);
  const phase = getGussetedPhaseProgress(t);
  const angles: GussetedAngles = {
    tuck: Math.PI * smooth(phase.TUCK),
    wrap: Math.PI * smooth(phase.WRAP),
    flap: Math.PI * smooth(phase.WRAP / 0.6),
    bottom: Math.PI * smooth(phase.BOTTOM),
  };
  const open = getGussetedOpenShape(d, getGussetedMaxMouthHalfDepth(d) * smooth(phase.OPEN));
  const { tuck: psi, wrap: omega, flap: chi, bottom: theta } = angles;

  // Links (panel-local x → world), FRONT fixed in the sheet plane.
  const dir = (phi: number) => pt(Math.cos(phi), -Math.sin(phi));
  const pr = pt(W / 2, 0);
  const pl = pt(-W / 2, 0);
  const a = pt(pr.x + (F / 2) * dir(psi).x, pr.y + (F / 2) * dir(psi).y);
  const e2 = pt(a.x + F / 2, a.y);
  const g = pt(e2.x + W * dir(omega).x, e2.y + W * dir(omega).y);
  const aL = pt(pl.x - (F / 2) * Math.cos(psi), pl.y - (F / 2) * Math.sin(psi));
  const links: Record<GussetedLink, RigidTransform> = {
    FRONT: link(0, 0, -W / 2, 0),
    RF: link(psi, 0, pr.x, pr.y),
    RB: link(0, F / 2, a.x, a.y),
    BACK: link(omega, 0, e2.x, e2.y),
    GLUE: link(omega + chi, 0, g.x, g.y),
    LF: link(-psi, F, pl.x, pl.y),
    LB: link(0, F / 2, aL.x, aL.y),
  };

  // Strip: half-turn to the back about the bottom fold line (y = 0, z = 0): the strip (y < 0) swings to −z.
  const strip = rotationX(theta);

  // Opening (from the finished flat bag): FRONT side tilts to +z, BACK side to −z about the seal line (y = b, z = 0);
  // the crease triangles go through b (mouth corner), c (crease top) and e (crease on the seal line).
  const { tilt, topY, creaseTop, mouthHalfDepth: zf } = open;
  const tiltFront = rotationX(tilt, b, 0);
  const tiltBack = rotationX(-tilt, b, 0);
  const creaseOf = (half: Half): RigidTransform => {
    const side = half === 'RF' || half === 'RB' ? 1 : -1;
    const z = half === 'RF' || half === 'LF' ? zf : -zf;
    const b0 = { x: side * (W / 2), y: H, z: 0 };
    const c0 = { x: side * (W / 2 - F / 2), y: H, z: 0 };
    const e0 = { x: side * (W / 2 - F / 2), y: b, z: 0 };
    const b1 = { x: side * (W / 2), y: topY, z };
    const c1 = { x: side * creaseTop.x, y: creaseTop.y, z: 0 };
    return triangleTransform(b0, c0, e0, b1, c1, e0);
  };
  const crease: Record<Half, RigidTransform> = { RF: creaseOf('RF'), RB: creaseOf('RB'), LB: creaseOf('LB'), LF: creaseOf('LF') };
  const opening = (link: GussetedLink, part: GussetedPart): RigidTransform => {
    if (part === 'STRIP' || part === 'BAND') return IDENTITY;
    const frontSide = link === 'FRONT' || link === 'RF' || link === 'LF';
    if (part === 'UPPER' || part === 'EDGE') return frontSide ? tiltFront : tiltBack;
    return crease[link === 'GLUE' ? 'LB' : (link as Half)];
  };

  const transforms = {} as Record<GussetedPieceId, RigidTransform>;
  for (const l of Object.keys(links) as GussetedLink[]) {
    const wall = l === 'FRONT' || l === 'BACK';
    for (const part of wall ? (['STRIP', 'BAND', 'UPPER'] as const) : (['STRIP', 'BAND', 'EDGE', 'CREASE'] as const)) {
      const formed = part === 'STRIP' ? compose(strip, links[l]) : links[l];
      transforms[`${l}_${part}`] = compose(opening(l, part), formed);
    }
  }

  const wrapDone = smooth(phase.WRAP);
  return {
    width: W,
    height: H,
    depth: F,
    bottomFold: b,
    glueFlapWidth: s,
    timeline: t,
    angles,
    open,
    transforms,
    layerFade: smooth(phase.TUCK),
    stripStack: (1 - Math.cos(theta)) / 2,
    view: { centreX: ((W + s) / 2) * (1 - wrapDone), lift: b * Math.max(0, Math.cos(theta)) },
  };
}

/** Position (mm, bag frame) of the panel-local point (x, y) of a piece (writes into `out`). */
export function gussetedPoint(pose: GussetedPose, piece: Pick<GussetedPiece, 'id'>, x: number, y: number, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  out.x = x;
  out.y = y;
  out.z = 0;
  return applyGussetedRigid(pose.transforms[piece.id], out, out);
}

/** Unit print-side (outward) normal of a piece in the bag frame. */
export function gussetedPrintNormal(pose: GussetedPose, piece: Pick<GussetedPiece, 'id'>): Vec3 {
  const { r } = pose.transforms[piece.id];
  return { x: r[2], y: r[5], z: r[8] };
}

/** Layer value of every link along its print-side normal in the flat tube (steps; see the file comment). */
const LINK_LAYER: Readonly<Record<GussetedLink, number>> = {
  FRONT: 1.5,
  BACK: 1.5,
  RF: -0.5,
  RB: -0.5,
  LF: -0.5,
  LB: -0.5,
  GLUE: -1,
};
/** Sign of each link's print-side normal · +z in the flat tube (FRONT, RB, LB and the flap face +z). */
const LINK_FACING: Readonly<Record<GussetedLink, 1 | -1>> = { FRONT: 1, RB: 1, LB: 1, GLUE: 1, RF: -1, LF: -1, BACK: -1 };
/** Steps the folded strips move out so the whole strip stack lies outside BACK (BACK strip one step behind BACK). */
const STRIP_RESTACK_STEPS = 4;

/**
 * Render-only offset of a piece along its print-side normal, in layer steps (the renderer multiplies by its step,
 * ≤ 0.1 mm), faded in while the gussets tuck. Flat tube (z): FRONT +1.5, LF / RF +0.5, LB / RB −0.5, BACK −1.5, flap
 * −1 (between LB and BACK). The strips keep their wall's value while hanging and shift by 4 steps along the stack
 * normal as they fold, ending BACK strip −2.5, flap −3, RB / LB −3.5, RF / LF −4.5, FRONT −5.5 (outermost). Open bag:
 * the EDGE triangles lie 0.5 step inside their wall's inner face (FRONT +1.5 outside), the flap one step inside LB.
 */
export function getGussetedLayerSteps(pose: GussetedPose, piece: Pick<GussetedPiece, 'link' | 'strip'>): number {
  const base = LINK_LAYER[piece.link];
  const value = piece.strip ? base + STRIP_RESTACK_STEPS * pose.stripStack * LINK_FACING[piece.link] : base;
  return value * pose.layerFade;
}
