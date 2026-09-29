// Assembly of the bag from the flat sheet (preview timeline, docs/SPEC.md §4a/§4c), q ∈ [0, 1]: q = 0 is the flat
// dieline (every piece in one plane, print side towards the viewer), q = 1 is the formed open bag — exactly the BOX pose
// of the fold kinematics (`foldKinematics.ts`, p = 0). Pure maths in millimetres, no React / Three.js.
// Client bottom-forming spec [K] and its 3D realisation: docs/PRODUCTION.md §10.8.
//
//   A  tube        q ∈ [0.0, 0.4]  panels turn 90° about the vertical tube edges (FRONT fixed); the glue flap closes
//                                  the seam under LEFT's free edge from the inside
//   B  triangles   q ∈ [0.4, 0.6]  the side triangles (base D on the bottom line, apex D/2 deep) start turning in; the
//                                  corner lines pull the FRONT flap along and, a little, the BACK flap
//   C1 front flap  q ∈ [0.6, 0.8]  the FRONT flap follows the triangles onto the bottom
//   C2 back flap   q ∈ [0.8, 1.0]  the BACK flap closes last, over the front flap (glued on the overlap OV = 2E − D)
//
// Why B and C overlap: on the open tube a triangle and a flap meet at a bottom corner through the "ear" (the side
// corner piece), whose paper spans only 45° there. The 3D angle between the triangle's diagonal and the flap's corner
// line can therefore never exceed 45° without cutting the paper, i.e. cos β · cos δ + sin δ ≥ 1 (β triangle angle,
// δ flap angle, both 0 → 90°): the sides are folded 90° in and the front and back follow as the resultant — "one
// corner line pulls two walls", the flap and its two flat ears forming a trapezoid (client, 29.09.2026). Both flaps
// ride on that limit, δ = δmin(β); the FRONT flap is only slightly ahead (FRONT_FLAP_LEAD of the way to β, the most
// the triangle allows without the flap passing through it), so the BACK flap still closes last and ends on top. The
// front ears then bend a little along their bisector (22.5° from the corner line — a paper bend, not a crease); at
// q = 1 every ear lies flat under its triangle.
//
// Every piece is rigid; its pose is a rigid transform of its FLAT position (sheet → world: x = sheetX − D,
// y = sheetY − a, z = 0, i.e. FRONT's flat position is already its final one). World frame as in foldKinematics.ts:
// x to the right, y up, z towards the viewer; FRONT fixed in z = 0; the finished BACK is at z = −D; the bottom line is
// y = 0 (the allowance hangs below it before the bottom is formed).
//
// Exact at every q: the tube edges (C2, C3), the bottom lines of all walls (C1), the corner lines between each flap and
// its ears, the triangle / ear diagonals (C7) and the ear bends. Not rigid (inherent, like the real bag — Balkcom et al.,
// docs/PRODUCTION.md §3.5): the short ear centre crease C5 (a − D/2 = 15 mm below the diamond), whose two ears go to
// different flaps; it opens into a slit that is hidden under the flaps.

import { DIELINE_RULES } from '../config/productionRules';
import type { Dimensions } from '../types';
import { pointInConvexPolygon } from './blockBottom';
import type { Vec3 } from './foldKinematics';
import type { Point2, Polygon2 } from './sideGusset';
import { getBottomAllowance } from './tube';

/** Sheet columns (LEFT | FRONT | RIGHT | BACK | glue flap, docs/PRODUCTION.md §9.1). */
export type AssemblySheetPanel = 'LEFT' | 'FRONT' | 'RIGHT' | 'BACK' | 'GLUE';

/** An ear (side corner piece) is split by its bend line into the part on the corner line and the part on the diagonal. */
type EarPart = 'CORNER' | 'DIAGONAL';
type EarId = 'LEFT_EAR_BACK' | 'LEFT_EAR_FRONT' | 'RIGHT_EAR_FRONT' | 'RIGHT_EAR_BACK' | 'GLUE_EAR';

export type AssemblyPieceId =
  | 'FRONT_WALL'
  | 'FRONT_FLAP'
  | 'BACK_WALL'
  | 'BACK_FLAP'
  | 'LEFT_WALL'
  | 'LEFT_TRIANGLE'
  | 'RIGHT_WALL'
  | 'RIGHT_TRIANGLE'
  | 'GLUE_WALL'
  | 'GLUE_TRIANGLE'
  | `${EarId}_${EarPart}`;

export type AssemblyPiece = {
  id: AssemblyPieceId;
  panel: AssemblySheetPanel;
  /**
   * Panel-local mm, counter-clockwise seen from the print side: u from the column's left sheet edge (= the panel-local
   * x of blockBottom.ts for the walls), v up from the bottom line (v < 0 = bottom allowance).
   */
  polygon: Polygon2;
  /** Part of the bottom allowance (v ≤ 0). */
  allowance: boolean;
  /**
   * Paper layer counted from the outside where pieces overlap in the formed bag (render-only offset hint): walls 0,
   * glue flap 1 (inside LEFT); bottom: BACK flap 0 (outermost, client rule [K]), glue-flap ear 1, back ears 2, FRONT
   * flap 3, front ears 4, side triangles 5, glue-flap triangle 6.
   */
  layer: number;
  /**
   * Piece whose inside face defines "inwards" for the layer offset: the piece itself, or — for the ears — the flap
   * they end up on (an ear lies flipped, print side inwards).
   */
  host: AssemblyPieceId;
};

type Dims = Pick<Dimensions, 'width' | 'height' | 'depth'>;

const pt = (x: number, y: number): Point2 => ({ x, y });
const rect = (x0: number, y0: number, x1: number, y1: number): Polygon2 => [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1)];

/** Angle of an ear's bend line from its corner line: the bisector of the ear's 45° corner (π/8). */
export const EAR_BEND_ANGLE = Math.PI / 8;

/** Sheet x of each column's u = 0 (LEFT | FRONT | RIGHT | BACK | glue flap). */
export function getAssemblySheetOrigins(d: Pick<Dimensions, 'width' | 'depth'>): Record<AssemblySheetPanel, number> {
  const { width: W, depth: D } = d;
  return { LEFT: 0, FRONT: D, RIGHT: W + D, BACK: W + 2 * D, GLUE: 2 * W + 2 * D };
}

/**
 * The rigid pieces of the sheet (docs/PRODUCTION.md §10.8): four walls + glue flap, the FRONT / BACK flaps, and each
 * side allowance split into the middle triangle and two ears along the lower diamond diagonals (C7) and the ear centre
 * crease (C5); every ear is split once more along its bend line. The glue flap's allowance is split like LEFT's strip
 * it is laminated to; its ends are chamfered at 45° like the cut outline (docs/PRODUCTION.md §9.2). Together the
 * pieces tile the sheet exactly.
 */
export function getAssemblyPieces(d: Dims, glueFlapWidth: number = DIELINE_RULES.glueFlapWidth): AssemblyPiece[] {
  const { width: W, height: H, depth: D } = d;
  const a = getBottomAllowance(d);
  const h = D / 2;
  const s = Math.max(0, Math.min(glueFlapWidth, h));
  const bend = Math.min(h, a * Math.tan(EAR_BEND_ANGLE)); // where the ear bend line meets the tube end
  const triangle: Polygon2 = [pt(0, 0), pt(h, -h), pt(D, 0)];
  // Ear with the corner line at u = 0 (u ∈ [0, D/2]) and at u = D (u ∈ [D/2, D]).
  const lowEar = { CORNER: [pt(0, -a), pt(bend, -a), pt(0, 0)], DIAGONAL: [pt(bend, -a), pt(h, -a), pt(h, -h), pt(0, 0)] };
  const highEar = {
    CORNER: [pt(D - bend, -a), pt(D, -a), pt(D, 0)],
    DIAGONAL: [pt(h, -a), pt(D - bend, -a), pt(D, 0), pt(h, -h)],
  };
  const piece = (
    id: AssemblyPieceId,
    panel: AssemblySheetPanel,
    polygon: Polygon2,
    layer: number,
    host: AssemblyPieceId = id,
  ): AssemblyPiece => ({ id, panel, polygon, allowance: polygon.every((p) => p.y <= 1e-9), layer, host });
  const ear = (id: EarId, panel: AssemblySheetPanel, shape: Record<EarPart, Polygon2>, layer: number, host: AssemblyPieceId) =>
    (['CORNER', 'DIAGONAL'] as const).map((part) => piece(`${id}_${part}`, panel, shape[part], layer, host));
  const pieces = [
    piece('FRONT_WALL', 'FRONT', rect(0, 0, W, H), 0),
    piece('FRONT_FLAP', 'FRONT', rect(0, -a, W, 0), 3),
    piece('BACK_WALL', 'BACK', rect(0, 0, W, H), 0),
    piece('BACK_FLAP', 'BACK', rect(0, -a, W, 0), 0),
    piece('LEFT_WALL', 'LEFT', rect(0, 0, D, H), 0),
    piece('LEFT_TRIANGLE', 'LEFT', triangle, 5),
    // LEFT: u = 0 at BACK (the free sheet edge / seam), u = D at FRONT.
    ...ear('LEFT_EAR_BACK', 'LEFT', lowEar, 2, 'BACK_FLAP'),
    ...ear('LEFT_EAR_FRONT', 'LEFT', highEar, 4, 'FRONT_FLAP'),
    piece('RIGHT_WALL', 'RIGHT', rect(0, 0, D, H), 0),
    piece('RIGHT_TRIANGLE', 'RIGHT', triangle, 5),
    // RIGHT: u = 0 at FRONT, u = D at BACK.
    ...ear('RIGHT_EAR_FRONT', 'RIGHT', lowEar, 4, 'FRONT_FLAP'),
    ...ear('RIGHT_EAR_BACK', 'RIGHT', highEar, 2, 'BACK_FLAP'),
  ];
  if (s > 0) {
    // The glue flap lies on LEFT's strip u ∈ [0, s]; LEFT's back-ear bend line crosses it at v = −s / tan(π/8).
    const bendV = Math.max(-a + s, -s / Math.tan(EAR_BEND_ANGLE));
    pieces.push(
      // Both ends of the glue flap are chamfered at 45° [K]: the free edge u = s runs from v = −a + s to v = H − s.
      piece('GLUE_WALL', 'GLUE', [pt(0, 0), pt(s, 0), pt(s, H - s), pt(0, H)], 1),
      piece('GLUE_TRIANGLE', 'GLUE', [pt(0, 0), pt(s, -s), pt(s, 0)], 6),
      piece('GLUE_EAR_CORNER', 'GLUE', [pt(0, -a), pt(s, -a + s), pt(s, bendV), pt(0, 0)], 1, 'BACK_FLAP'),
      piece('GLUE_EAR_DIAGONAL', 'GLUE', [pt(0, 0), pt(s, bendV), pt(s, -s)], 1, 'BACK_FLAP'),
    );
  }
  return pieces;
}

/** First piece of `panel` containing the panel-local point (inclusive), e.g. to attach a dieline line to a piece. */
export function findAssemblyPiece(
  pieces: readonly AssemblyPiece[],
  panel: AssemblySheetPanel,
  p: Point2,
  tolerance = 1e-6,
): AssemblyPiece | undefined {
  return pieces.find((piece) => piece.panel === panel && pointInConvexPolygon(p, piece.polygon, tolerance));
}

// ——— Phases ———

export type AssemblyPhaseId = 'TUBE' | 'TRIANGLES' | 'FRONT_FLAP' | 'BACK_FLAP';

/** Sub-ranges of q per phase (client spec: A 0–0.4, B 0.4–0.6, C1 0.6–0.8, C2 0.8–1.0). */
export const ASSEMBLY_PHASES: Readonly<Record<AssemblyPhaseId, readonly [number, number]>> = {
  TUBE: [0, 0.4],
  TRIANGLES: [0.4, 0.6],
  FRONT_FLAP: [0.6, 0.8],
  BACK_FLAP: [0.8, 1],
};

const ASSEMBLY_PHASE_IDS = Object.keys(ASSEMBLY_PHASES) as AssemblyPhaseId[];

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);
const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** Linear progress 0..1 of every phase at q (q clamped to [0, 1], NaN → 0). */
export function getAssemblyPhaseProgress(assemblyProgress: number): Record<AssemblyPhaseId, number> {
  const q = clamp01(assemblyProgress);
  const out = {} as Record<AssemblyPhaseId, number>;
  for (const id of ASSEMBLY_PHASE_IDS) {
    const [from, to] = ASSEMBLY_PHASES[id];
    out[id] = clamp01((q - from) / (to - from));
  }
  return out;
}

/** The phase running at q (its start inclusive); q = 1 → the last phase. */
export function getAssemblyPhase(assemblyProgress: number): AssemblyPhaseId {
  const q = clamp01(assemblyProgress);
  return ASSEMBLY_PHASE_IDS.find((id) => q < ASSEMBLY_PHASES[id][1]) ?? 'BACK_FLAP';
}

/**
 * Smallest flap angle δ that a triangle at angle β allows (the ear keeps its 45° corner flat):
 * cos β · cos δ + sin δ = 1 → δ = asin(1 / √(1 + cos²β)) − atan(cos β); 0 at β = 0, π/2 at β = π/2.
 */
export function getMinFlapAngle(triangleAngle: number): number {
  const k = Math.cos(triangleAngle);
  return Math.max(0, Math.asin(Math.min(1, 1 / Math.sqrt(1 + k * k))) - Math.atan(k));
}

/** Share of the way from δmin(β) to β by which the FRONT flap leads the BACK flap (0 = both exactly resultant). */
export const FRONT_FLAP_LEAD = 0.3;

export type AssemblyAngles = {
  /** Tube: every panel turns by this about its vertical edge (0 → π/2). */
  tube: number;
  /** Side triangles turning in on the bottom line (0 → π/2). */
  triangles: number;
  /** FRONT flap onto the bottom (0 → π/2): resultant of the triangles, slightly ahead (FRONT_FLAP_LEAD). */
  frontFlap: number;
  /** BACK flap over the front flap (0 → π/2): exactly the resultant, getMinFlapAngle(triangles). */
  backFlap: number;
};

export function getAssemblyAngles(assemblyProgress: number): AssemblyAngles {
  const q = clamp01(assemblyProgress);
  const phase = getAssemblyPhaseProgress(q);
  const bottomStart = ASSEMBLY_PHASES.TRIANGLES[0];
  const triangles = (Math.PI / 2) * smoothstep(clamp01((q - bottomStart) / (1 - bottomStart)));
  const resultant = q >= 1 ? Math.PI / 2 : getMinFlapAngle(triangles);
  return {
    tube: (Math.PI / 2) * smoothstep(phase.TUBE),
    triangles,
    frontFlap: resultant + FRONT_FLAP_LEAD * (triangles - resultant),
    backFlap: resultant,
  };
}

// ——— Rigid transforms ———

/** Rigid transform: world = r · p + t (r row-major 3×3). */
export type RigidTransform = { r: readonly number[]; t: Vec3 };

const IDENTITY: RigidTransform = { r: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: { x: 0, y: 0, z: 0 } };

function mulR(a: readonly number[], b: readonly number[]): number[] {
  const out = new Array<number>(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) out[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  }
  return out;
}

function rotateVec(r: readonly number[], v: Vec3): Vec3 {
  return {
    x: r[0] * v.x + r[1] * v.y + r[2] * v.z,
    y: r[3] * v.x + r[4] * v.y + r[5] * v.z,
    z: r[6] * v.x + r[7] * v.y + r[8] * v.z,
  };
}

/** a ∘ b (apply b first). */
function compose(a: RigidTransform, b: RigidTransform): RigidTransform {
  const t = rotateVec(a.r, b.t);
  return { r: mulR(a.r, b.r), t: { x: t.x + a.t.x, y: t.y + a.t.y, z: t.z + a.t.z } };
}

/** Rotation by `angle` about the axis through `pivot` along +x or +y (right-handed). */
function rotation(axis: 'x' | 'y', angle: number, pivot: Vec3 = { x: 0, y: 0, z: 0 }): RigidTransform {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const r = axis === 'x' ? [1, 0, 0, 0, c, -s, 0, s, c] : [c, 0, s, 0, 1, 0, -s, 0, c];
  const rp = rotateVec(r, pivot);
  return { r, t: { x: pivot.x - rp.x, y: pivot.y - rp.y, z: pivot.z - rp.z } };
}

const translation = (x: number): RigidTransform => ({ r: IDENTITY.r, t: { x, y: 0, z: 0 } });

/** Applies a rigid transform to a point (writes into `out`). */
export function applyRigid(m: RigidTransform, p: Vec3, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  const { x, y, z } = p;
  out.x = m.r[0] * x + m.r[1] * y + m.r[2] * z + m.t.x;
  out.y = m.r[3] * x + m.r[4] * y + m.r[5] * z + m.t.y;
  out.z = m.r[6] * x + m.r[7] * y + m.r[8] * z + m.t.z;
  return out;
}

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const add = (a: Vec3, b: Vec3, k = 1): Vec3 => ({ x: a.x + k * b.x, y: a.y + k * b.y, z: a.z + k * b.z });
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
function normalize(a: Vec3): Vec3 {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}
const flat = (p: Point2): Vec3 => ({ x: p.x, y: p.y, z: 0 });

/**
 * Rigid transform mapping the flat frame (origin `o`, orthonormal in-plane directions a2, b2) onto the world frame
 * (origin `O`, orthonormal a3, b3); the flat normal follows so that the map is a proper rotation.
 */
function frameTransform(o: Vec3, a2: Point2, b2: Point2, O: Vec3, a3: Vec3, b3: Vec3): RigidTransform {
  const handedness = Math.sign(a2.x * b2.y - a2.y * b2.x) || 1;
  const n3 = cross(a3, b3);
  const col = (v: Vec3, k: number): Vec3 => ({ x: v.x * k, y: v.y * k, z: v.z * k });
  const n = col(n3, handedness);
  const r = [
    a3.x * a2.x + b3.x * b2.x, a3.x * a2.y + b3.x * b2.y, n.x,
    a3.y * a2.x + b3.y * b2.x, a3.y * a2.y + b3.y * b2.y, n.y,
    a3.z * a2.x + b3.z * b2.x, a3.z * a2.y + b3.z * b2.y, n.z,
  ];
  const ro = rotateVec(r, o);
  return { r, t: { x: O.x - ro.x, y: O.y - ro.y, z: O.z - ro.z } };
}

/**
 * Poses of the two parts of one ear, stretched between a flap (along the corner line) and a triangle (along the
 * diagonal). `cornerFlat` is the ear corner in its side panel's flat frame, `side` +1 when the ear lies towards +u of
 * its corner line (−1 towards −u). The corner is taken from the side wall: it lies on the bottom line, so the flap and
 * triangle turns keep it fixed, and it is the ear's own corner even while the seam (LEFT ↔ BACK) is still open.
 */
function earTransforms(
  cornerFlat: Vec3,
  side: 1 | -1,
  sideWall: RigidTransform,
  flap: RigidTransform,
  triangle: RigidTransform,
): Record<EarPart, RigidTransform> {
  const c2 = pt(0, -1);
  const d2 = pt(side * Math.SQRT1_2, -Math.SQRT1_2);
  const x2 = pt(side * Math.sin(EAR_BEND_ANGLE), -Math.cos(EAR_BEND_ANGLE));
  const O = applyRigid(sideWall, cornerFlat);
  const c = rotateVec(flap.r, { x: 0, y: -1, z: 0 });
  const d = rotateVec(triangle.r, flat(d2));
  // Bend line x: EAR_BEND_ANGLE from both c and d (the ear is flat when c and d are 45° apart).
  const g = Math.min(1, Math.max(-1, dot(c, d)));
  const cosB = Math.cos(EAR_BEND_ANGLE);
  const base = add(c, d);
  const k = cosB / (1 + g);
  const out2 = 1 - (2 * cosB * cosB) / (1 + g);
  let x = normalize(base);
  if (out2 > 1e-12) {
    // Bend into the wedge between the inside of the flap and the outside of the triangle.
    const n = normalize(cross(c, d));
    const wedge = add(rotateVec(flap.r, { x: 0, y: 0, z: -1 }), rotateVec(triangle.r, { x: 0, y: 0, z: 1 }));
    const sign = dot(n, wedge) < 0 ? -1 : 1;
    x = normalize(add({ x: base.x * k, y: base.y * k, z: base.z * k }, n, sign * Math.sqrt(out2)));
  }
  const perp = (v: Vec3, axis: Vec3) => normalize(add(v, axis, -dot(v, axis)));
  const perp2 = (v: Point2, axis: Point2): Point2 => {
    const k2 = v.x * axis.x + v.y * axis.y;
    const w = pt(v.x - k2 * axis.x, v.y - k2 * axis.y);
    const l = Math.hypot(w.x, w.y) || 1;
    return pt(w.x / l, w.y / l);
  };
  return {
    CORNER: frameTransform(cornerFlat, c2, perp2(x2, c2), O, c, perp(x, c)),
    DIAGONAL: frameTransform(cornerFlat, x2, perp2(d2, x2), O, x, perp(d, x)),
  };
}

// ——— Pose ———

export type AssemblyPose = {
  width: number;
  height: number;
  depth: number;
  allowance: number;
  glueFlapWidth: number;
  assemblyProgress: number;
  angles: AssemblyAngles;
  /** World x of each column's u = 0 in the flat sheet (sheet x − D). */
  flatX: Record<AssemblySheetPanel, number>;
  /** Transform of every piece from its flat position to the world. */
  transforms: Record<AssemblyPieceId, RigidTransform>;
  /**
   * Suggested view placement (render-only): the model point to keep centred (sheet centre at q = 0 → the BOX centre
   * (W/2, ·, −D/2) once the tube is formed) and the lift that keeps the lowest hanging paper on the floor y = 0
   * (a while the BACK flap hangs, 0 once it is folded).
   */
  view: { centreX: number; centreZ: number; lift: number };
};

export function getAssemblyPose(
  d: Dims,
  assemblyProgress: number,
  glueFlapWidth: number = DIELINE_RULES.glueFlapWidth,
): AssemblyPose {
  const { width: W, height: H, depth: D } = d;
  const a = getBottomAllowance(d);
  const s = Math.max(0, Math.min(glueFlapWidth, D / 2));
  const q = clamp01(assemblyProgress);
  const angles = getAssemblyAngles(q);
  const { tube: al, triangles: be, frontFlap: dF, backFlap: dB } = angles;
  const origins = getAssemblySheetOrigins(d);
  const flatX = {} as Record<AssemblySheetPanel, number>;
  for (const key of Object.keys(origins) as AssemblySheetPanel[]) flatX[key] = origins[key] - D;
  const at = (x: number): Vec3 => ({ x, y: 0, z: 0 });

  // Walls: FRONT fixed; LEFT turns back on the FRONT/LEFT edge; RIGHT → BACK → glue flap is a chain of tube edges.
  const front = IDENTITY;
  const left = rotation('y', -al, at(0));
  const right = rotation('y', al, at(W));
  const back = compose(right, rotation('y', al, at(W + D)));
  const glue = compose(back, rotation('y', al, at(2 * W + D)));
  // Flaps and triangles turn inwards (flat −z = the inside of every panel) on the flat bottom line y = 0, z = 0.
  const frontFlap = compose(front, rotation('x', dF));
  const backFlap = compose(back, rotation('x', dB));
  const leftTriangle = compose(left, rotation('x', be));
  const rightTriangle = compose(right, rotation('x', be));
  // Ears between flap corner lines and triangle diagonals (the corner is shared by the side and the flap panel).
  const leftEarFront = earTransforms(at(flatX.LEFT + D), -1, left, frontFlap, leftTriangle);
  const leftEarBack = earTransforms(at(flatX.LEFT), 1, left, backFlap, leftTriangle);
  const rightEarFront = earTransforms(at(flatX.RIGHT), 1, right, frontFlap, rightTriangle);
  const rightEarBack = earTransforms(at(flatX.RIGHT + D), -1, right, backFlap, rightTriangle);
  // The glue flap swings in with BACK while the tube forms; from then on it is laminated to LEFT's back strip.
  const tubeClosed = q > ASSEMBLY_PHASES.TUBE[1];
  const onLeft = (m: RigidTransform) => (tubeClosed ? compose(m, translation(flatX.LEFT - flatX.GLUE)) : glue);

  const transforms: Record<AssemblyPieceId, RigidTransform> = {
    FRONT_WALL: front,
    FRONT_FLAP: frontFlap,
    BACK_WALL: back,
    BACK_FLAP: backFlap,
    LEFT_WALL: left,
    LEFT_TRIANGLE: leftTriangle,
    LEFT_EAR_FRONT_CORNER: leftEarFront.CORNER,
    LEFT_EAR_FRONT_DIAGONAL: leftEarFront.DIAGONAL,
    LEFT_EAR_BACK_CORNER: leftEarBack.CORNER,
    LEFT_EAR_BACK_DIAGONAL: leftEarBack.DIAGONAL,
    RIGHT_WALL: right,
    RIGHT_TRIANGLE: rightTriangle,
    RIGHT_EAR_FRONT_CORNER: rightEarFront.CORNER,
    RIGHT_EAR_FRONT_DIAGONAL: rightEarFront.DIAGONAL,
    RIGHT_EAR_BACK_CORNER: rightEarBack.CORNER,
    RIGHT_EAR_BACK_DIAGONAL: rightEarBack.DIAGONAL,
    GLUE_WALL: glue,
    GLUE_TRIANGLE: onLeft(leftTriangle),
    GLUE_EAR_CORNER: onLeft(leftEarBack.CORNER),
    GLUE_EAR_DIAGONAL: onLeft(leftEarBack.DIAGONAL),
  };

  const tubeDone = smoothstep(getAssemblyPhaseProgress(q).TUBE);
  const sheetCentreX = (flatX.LEFT + flatX.GLUE + s) / 2;
  return {
    width: W,
    height: H,
    depth: D,
    allowance: a,
    glueFlapWidth: s,
    assemblyProgress: q,
    angles,
    flatX,
    transforms,
    view: {
      centreX: sheetCentreX + (W / 2 - sheetCentreX) * tubeDone,
      centreZ: (-D / 2) * tubeDone + 0, // + 0 turns −0 into 0
      lift: dB >= Math.PI / 2 ? 0 : a * Math.cos(dB),
    },
  };
}

/** World position (mm) of the panel-local point (u, v) of a piece (writes into `out`, no allocation). */
export function assemblyPoint(
  pose: AssemblyPose,
  piece: Pick<AssemblyPiece, 'id' | 'panel'>,
  u: number,
  v: number,
  out: Vec3 = { x: 0, y: 0, z: 0 },
): Vec3 {
  out.x = pose.flatX[piece.panel] + u;
  out.y = v;
  out.z = 0;
  return applyRigid(pose.transforms[piece.id], out, out);
}

/** Unit vector pointing to the inside (unprinted side) of the piece's host (see `AssemblyPiece.host`). */
export function assemblyInwardNormal(pose: AssemblyPose, piece: Pick<AssemblyPiece, 'host'>): Vec3 {
  return rotateVec(pose.transforms[piece.host].r, { x: 0, y: 0, z: -1 });
}

// ——— Preview timeline: assembly (sheet → BOX), then the existing fold (BOX → flat) ———

/**
 * Share of the preview timeline taken by the assembly (docs/SPEC.md §4a/§4c). 0.4 keeps every preset on the 1 %
 * slider grid: SHEET 0, BOX 0.4, STANDING 0.4 + 0.6 · 0.25 = 0.55, FLAT 1.
 */
export const ASSEMBLY_TIMELINE_SHARE = 0.4;

/** Timeline t ∈ [0, 1] → assembly progress q and fold progress p (q < 1 ⇒ p = 0; p > 0 ⇒ q = 1). */
export function splitPreviewTimeline(timeline: number): { assemblyProgress: number; foldProgress: number } {
  const t = clamp01(timeline);
  if (t < ASSEMBLY_TIMELINE_SHARE) return { assemblyProgress: t / ASSEMBLY_TIMELINE_SHARE, foldProgress: 0 };
  return { assemblyProgress: 1, foldProgress: (t - ASSEMBLY_TIMELINE_SHARE) / (1 - ASSEMBLY_TIMELINE_SHARE) };
}

/** Inverse of `splitPreviewTimeline` (a fold progress > 0 implies a finished assembly). */
export function toPreviewTimeline(assemblyProgress: number, foldProgress: number): number {
  const q = clamp01(assemblyProgress);
  const p = clamp01(foldProgress);
  return q < 1 ? q * ASSEMBLY_TIMELINE_SHARE : ASSEMBLY_TIMELINE_SHARE + p * (1 - ASSEMBLY_TIMELINE_SHARE);
}
