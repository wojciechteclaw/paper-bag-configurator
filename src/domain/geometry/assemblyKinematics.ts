// Assembly of the bag from the flat sheet (preview timeline, docs/SPEC.md §4a/§4c), q ∈ [0, 1]: q = 0 is the flat
// dieline (every piece in one plane, print side towards the viewer), q = 1 is the formed open bag — exactly the BOX pose
// of the fold kinematics (`foldKinematics.ts`, p = 0). Pure maths in millimetres, no React / Three.js.
// Client bottom model [K] and its 3D realisation: docs/PRODUCTION.md §3.4, §10.8. Strictly sequential phases:
//
//   A  tube             q ∈ [0.0, 0.4]  panels turn 90° about the vertical tube edges (FRONT fixed); the glue flap
//                                       closes the seam under LEFT's free edge from the inside
//   B  sides in         q ∈ [0.4, 0.6]  the LEFT / RIGHT bottom zones turn in WHOLE (90° on the bottom line); the
//                                       corner triangles ("ears") of FRONT / BACK, joined to them along the tube
//                                       corner edges, turn 180° over their 45° creases onto the inside of their
//                                       trapezoid
//   C1 front trapezoid  q ∈ [0.6, 0.8]  the FRONT trapezoid (with its ears) folds 90° onto the bottom, under the sides
//   C2 back trapezoid   q ∈ [0.8, 1.0]  the BACK trapezoid folds last, outermost (glued on the overlap OV = 2E − D)
//
// Stack from the inside out (client rule [K]): side flaps → FRONT ears → FRONT trapezoid → BACK ears → BACK trapezoid.
// A side flap never passes over a trapezoid: the sides are in (at y = 0) before either trapezoid leaves the vertical.
//
// Every piece is rigid; its pose is a rigid transform of its FLAT position (sheet → world: x = sheetX − D,
// y = sheetY − E, z = 0, i.e. FRONT's flat position is already its final one). World frame as in foldKinematics.ts:
// x to the right, y up, z towards the viewer; FRONT fixed in z = 0; the finished BACK is at z = −D; the bottom line is
// y = 0 (the zones hang below it before the bottom is formed).
//
// The ears: while a side zone turns by β, the tube corner edge it shares with the ear sweeps from vertical onto the
// wall's bottom line, but the ear's 45° corner (edge ↔ diagonal) can only follow rigidly at β = 0 and β = 90°. In
// between the 3D angle between the edge and the diagonal drops below 45° (to 0 at β = 45°), so the ear bends along the
// bisector of its corner (EAR_BEND_ANGLE = 22.5°, a paper bend, not a crease) OUTWARDS, away from the bag (client [K]:
// inwards it would fold onto the side flap turning in behind it); at β = 90° it lies flat again, turned over over its
// diagonal, in the plane of its trapezoid — in the stack between the side flap and the trapezoid (layer order). With that one bend every hinge stays closed at every
// q: tube edges C2 / C3, bottom line C1, the tube corner edges in the zones, the 45° creases C9 and the ear bends.

import { DIELINE_RULES } from '../config/productionRules';
import type { Dimensions } from '../types';
import {
  clipConvexPolygon,
  getBottomPieces,
  getBottomZonePieces,
  pointInConvexPolygon,
  type BottomPieceId,
  type BottomZonePieceId,
} from './blockBottom';
import type { Vec3 } from './foldKinematics';
import { polygonArea, type Point2, type Polygon2 } from './sideGusset';
import { getBottomAllowance } from './tube';

/** Sheet columns (LEFT | FRONT | RIGHT | BACK | glue flap, docs/PRODUCTION.md §9.1). */
export type AssemblySheetPanel = 'LEFT' | 'FRONT' | 'RIGHT' | 'BACK' | 'GLUE';

/** An ear (corner triangle of a FRONT / BACK zone) is split by its bend line into the part on the tube corner edge and the part on the 45° crease. */
type EarPart = 'CORNER' | 'DIAGONAL';
type EarId = 'FRONT_EAR_LEFT' | 'FRONT_EAR_RIGHT' | 'BACK_EAR_RIGHT' | 'BACK_EAR_LEFT';

export type AssemblyPieceId =
  | 'FRONT_WALL'
  | 'FRONT_TRAPEZOID'
  | 'BACK_WALL'
  | 'BACK_TRAPEZOID'
  | 'LEFT_WALL'
  | 'LEFT_SIDE_FLAP'
  | 'RIGHT_WALL'
  | 'RIGHT_SIDE_FLAP'
  | 'GLUE_WALL'
  | 'GLUE_BOTTOM'
  | `${EarId}_${EarPart}`;

export type AssemblyPiece = {
  id: AssemblyPieceId;
  panel: AssemblySheetPanel;
  /**
   * Panel-local mm, counter-clockwise seen from the print side: u from the column's left sheet edge (= the panel-local
   * x of blockBottom.ts for the walls), v up from the bottom line (v < 0 = bottom zone).
   */
  polygon: Polygon2;
  /** Part of the bottom zone (v ≤ 0). */
  allowance: boolean;
  /** The piece of the formed bottom it belongs to (`getBottomPieces`); unset for walls and the glue flap. */
  bottomPiece?: BottomPieceId;
  /**
   * Paper layer counted from the outside where pieces overlap in the formed bag (render-only offset hint): walls 0,
   * glue flap 1 (inside LEFT); bottom (client rule [K], `BottomPiece.layer`): BACK trapezoid 0 (outermost), BACK ears
   * 1, FRONT trapezoid 2, FRONT ears 3, side flaps 4, glue flap 5 (laminated to the inside of LEFT's side flap).
   */
  layer: number;
  /**
   * Piece whose inside face defines "inwards" for the layer offset: the piece itself, or — for the ears — the
   * trapezoid they end up on (an ear lies turned over, print side inwards).
   */
  host: AssemblyPieceId;
};

type Dims = Pick<Dimensions, 'width' | 'height' | 'depth'>;

const pt = (x: number, y: number): Point2 => ({ x, y });
const rect = (x0: number, y0: number, x1: number, y1: number): Polygon2 => [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1)];

/** Angle of an ear's bend line from the tube corner edge: the bisector of the ear's 45° corner (π/8). */
export const EAR_BEND_ANGLE = Math.PI / 8;

/** Sheet x of each column's u = 0 (LEFT | FRONT | RIGHT | BACK | glue flap). */
export function getAssemblySheetOrigins(d: Pick<Dimensions, 'width' | 'depth'>): Record<AssemblySheetPanel, number> {
  const { width: W, depth: D } = d;
  return { LEFT: 0, FRONT: D, RIGHT: W + D, BACK: W + 2 * D, GLUE: 2 * W + 2 * D };
}

/** Ear ids per wall zone piece (BACK x = 0 is at RIGHT). */
const EAR_OF: Record<'FRONT' | 'BACK', Record<'EAR_START' | 'EAR_END', EarId>> = {
  FRONT: { EAR_START: 'FRONT_EAR_LEFT', EAR_END: 'FRONT_EAR_RIGHT' },
  BACK: { EAR_START: 'BACK_EAR_RIGHT', EAR_END: 'BACK_EAR_LEFT' },
};

/**
 * The rigid pieces of the sheet (docs/PRODUCTION.md §10.8): four walls + glue flap, and the bottom zones of
 * `getBottomZonePieces` — FRONT / BACK trapezoids, their corner triangles (each split once more along its bend line:
 * CORNER part on the tube corner edge, DIAGONAL part on the 45° crease), the whole LEFT / RIGHT side flaps, and the glue
 * flap's zone part (laminated to LEFT's side flap). The glue flap's ends are chamfered at 45° like the cut outline
 * (docs/PRODUCTION.md §9.2). Together the pieces tile the sheet exactly.
 */
export function getAssemblyPieces(d: Dims, glueFlapWidth: number = DIELINE_RULES.glueFlapWidth): AssemblyPiece[] {
  const { width: W, height: H, depth: D } = d;
  const E = getBottomAllowance(d);
  const s = Math.max(0, Math.min(glueFlapWidth, D / 2));
  const tan = Math.tan(EAR_BEND_ANGLE);
  const layers = Object.fromEntries(getBottomPieces(d).map((p) => [`${p.panel}:${p.zonePiece}`, p]));
  const pieces: AssemblyPiece[] = [];
  const add = (id: AssemblyPieceId, panel: AssemblySheetPanel, polygon: Polygon2, layer: number, host: AssemblyPieceId = id, bottomPiece?: BottomPieceId) => {
    if (polygon.length < 3 || polygonArea(polygon) <= 1e-9) return;
    pieces.push({ id, panel, polygon, allowance: polygon.every((p) => p.y <= 1e-9), layer, host, ...(bottomPiece ? { bottomPiece } : {}) });
  };
  const zoneOf = (panel: 'FRONT' | 'BACK' | 'LEFT' | 'RIGHT', id: BottomZonePieceId) => {
    const polygon = getBottomZonePieces(panel, d).find((z) => z.id === id)!.polygon;
    return { polygon, bottom: layers[`${panel}:${id}`] };
  };

  for (const panel of ['FRONT', 'BACK'] as const) {
    add(`${panel}_WALL`, panel, rect(0, 0, W, H), 0);
    const trapezoidId = `${panel}_TRAPEZOID` as const;
    const trapezoid = zoneOf(panel, 'TRAPEZOID');
    add(trapezoidId, panel, trapezoid.polygon, trapezoid.bottom.layer, trapezoidId, trapezoid.bottom.id);
    for (const zonePiece of ['EAR_START', 'EAR_END'] as const) {
      const ear = zoneOf(panel, zonePiece);
      const earId = EAR_OF[panel][zonePiece];
      // Bend line from the corner at EAR_BEND_ANGLE to the tube corner edge: u = −v·tan (START), W − u = −v·tan (END).
      const [corner, diagonal] =
        zonePiece === 'EAR_START'
          ? [clipConvexPolygon(ear.polygon, pt(1, tan), 0), clipConvexPolygon(ear.polygon, pt(-1, -tan), 0)]
          : [clipConvexPolygon(ear.polygon, pt(-1, tan), -W), clipConvexPolygon(ear.polygon, pt(1, -tan), W)];
      add(`${earId}_CORNER`, panel, corner, ear.bottom.layer, trapezoidId, ear.bottom.id);
      add(`${earId}_DIAGONAL`, panel, diagonal, ear.bottom.layer, trapezoidId, ear.bottom.id);
    }
  }
  for (const panel of ['LEFT', 'RIGHT'] as const) {
    add(`${panel}_WALL`, panel, rect(0, 0, D, H), 0);
    const flap = zoneOf(panel, 'SIDE_FLAP');
    add(`${panel}_SIDE_FLAP`, panel, flap.polygon, flap.bottom.layer, `${panel}_SIDE_FLAP`, flap.bottom.id);
  }
  if (s > 0) {
    // Both ends of the glue flap are chamfered at 45° [K]: the free edge u = s runs from v = −E + s to v = H − s.
    add('GLUE_WALL', 'GLUE', [pt(0, 0), pt(s, 0), pt(s, H - s), pt(0, H)], 1);
    add('GLUE_BOTTOM', 'GLUE', [pt(0, -E), pt(s, -E + s), pt(s, 0), pt(0, 0)], 5);
  }
  // Stable order: walls first (lines on a wall / zone boundary attach to the wall), then the zones outermost first.
  return pieces.sort((p, q) => Number(p.allowance) - Number(q.allowance) || p.layer - q.layer);
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

export type AssemblyPhaseId = 'TUBE' | 'SIDES' | 'FRONT_TRAPEZOID' | 'BACK_TRAPEZOID';

/** Sub-ranges of q per phase (client order: A tube 0–0.4, B sides 0.4–0.6, C1 front 0.6–0.8, C2 back 0.8–1.0). */
export const ASSEMBLY_PHASES: Readonly<Record<AssemblyPhaseId, readonly [number, number]>> = {
  TUBE: [0, 0.4],
  SIDES: [0.4, 0.6],
  FRONT_TRAPEZOID: [0.6, 0.8],
  BACK_TRAPEZOID: [0.8, 1],
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
  return ASSEMBLY_PHASE_IDS.find((id) => q < ASSEMBLY_PHASES[id][1]) ?? 'BACK_TRAPEZOID';
}

export type AssemblyAngles = {
  /** Tube: every panel turns by this about its vertical edge (0 → π/2). */
  tube: number;
  /** LEFT / RIGHT bottom zones turning in whole on the bottom line (0 → π/2). */
  sides: number;
  /** FRONT trapezoid onto the bottom (0 → π/2), after the sides. */
  frontTrapezoid: number;
  /** BACK trapezoid over the FRONT one (0 → π/2), last. */
  backTrapezoid: number;
};

/** Phase angles: each phase turns its pieces 0 → 90° with a smoothstep ease, one after the other. */
export function getAssemblyAngles(assemblyProgress: number): AssemblyAngles {
  const phase = getAssemblyPhaseProgress(assemblyProgress);
  const quarter = (t: number) => (Math.PI / 2) * smoothstep(t);
  return {
    tube: quarter(phase.TUBE),
    sides: quarter(phase.SIDES),
    frontTrapezoid: quarter(phase.FRONT_TRAPEZOID),
    backTrapezoid: quarter(phase.BACK_TRAPEZOID),
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
 * Poses of the two parts of one ear of a FRONT / BACK zone, stretched between the neighbouring side flap (along the
 * tube corner edge) and the trapezoid (along the 45° crease). Computed in the frame of the ear's own wall (`wall`),
 * where — once the tube is formed — the side wall stands at the wall's edge, perpendicular, the inside of the bag at
 * flat −z; the side flap turned by β moves the corner edge to direction (σ·sin β, −cos β, 0) (σ = +1 at the wall's
 * x = 0 edge, −1 at x = W). Because the frame is the wall's own, the ear stays attached to its corner even while the
 * seam (BACK ↔ LEFT) is still open (then β = 0 and the ear is flat in its wall).
 */
function earTransforms(
  cornerFlat: Vec3,
  sigma: 1 | -1,
  sides: number,
  wall: RigidTransform,
  trapezoid: RigidTransform,
): Record<EarPart, RigidTransform> {
  const c2 = pt(0, -1);
  const d2 = pt(sigma * Math.SQRT1_2, -Math.SQRT1_2);
  const x2 = pt(sigma * Math.sin(EAR_BEND_ANGLE), -Math.cos(EAR_BEND_ANGLE));
  const O = applyRigid(wall, cornerFlat);
  const c = rotateVec(wall.r, { x: sigma * Math.sin(sides), y: -Math.cos(sides), z: 0 });
  const d = rotateVec(trapezoid.r, flat(d2));
  // Bend line x: EAR_BEND_ANGLE from both c and d (the ear is flat when c and d are 45° apart).
  const g = Math.min(1, Math.max(-1, dot(c, d)));
  const cosB = Math.cos(EAR_BEND_ANGLE);
  const base = add(c, d);
  const k = cosB / (1 + g);
  const out2 = 1 - (2 * cosB * cosB) / (1 + g);
  let x = normalize(base);
  if (out2 > 1e-12) {
    // Bend OUTWARDS, away from the bag (client [K], 29.09.2026): the ear then never folds onto / through the side
    // flap turning in behind it (inwards it would lie in the side flap's plane at β = 45°).
    const outward = rotateVec(trapezoid.r, { x: 0, y: 0, z: 1 });
    const cd = cross(c, d);
    const len = Math.hypot(cd.x, cd.y, cd.z);
    const sign = Math.sign(dot(cd, outward)) || 1;
    // c ∥ d (β = 45° in phase B): any normal of c; take the outward one.
    const n = len > 1e-9 ? normalize({ x: cd.x * sign, y: cd.y * sign, z: cd.z * sign }) : normalize(add(outward, c, -dot(outward, c)));
    x = normalize(add({ x: base.x * k, y: base.y * k, z: base.z * k }, n, Math.sqrt(out2)));
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
   * (E while the BACK trapezoid hangs, 0 once it is folded).
   */
  view: { centreX: number; centreZ: number; lift: number };
};

export function getAssemblyPose(
  d: Dims,
  assemblyProgress: number,
  glueFlapWidth: number = DIELINE_RULES.glueFlapWidth,
): AssemblyPose {
  const { width: W, height: H, depth: D } = d;
  const E = getBottomAllowance(d);
  const s = Math.max(0, Math.min(glueFlapWidth, D / 2));
  const q = clamp01(assemblyProgress);
  const angles = getAssemblyAngles(q);
  const { tube: al, sides: be, frontTrapezoid: dF, backTrapezoid: dB } = angles;
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
  // Zones turn inwards (flat −z = the inside of every panel) on the flat bottom line y = 0, z = 0.
  const frontTrapezoid = compose(front, rotation('x', dF));
  const backTrapezoid = compose(back, rotation('x', dB));
  const leftFlap = compose(left, rotation('x', be));
  const rightFlap = compose(right, rotation('x', be));
  // Ears: FRONT x = 0 at LEFT, x = W at RIGHT; BACK x = 0 at RIGHT, x = W at LEFT.
  const frontEarLeft = earTransforms(at(flatX.FRONT), 1, be, front, frontTrapezoid);
  const frontEarRight = earTransforms(at(flatX.FRONT + W), -1, be, front, frontTrapezoid);
  const backEarRight = earTransforms(at(flatX.BACK), 1, be, back, backTrapezoid);
  const backEarLeft = earTransforms(at(flatX.BACK + W), -1, be, back, backTrapezoid);
  // The glue flap swings in with BACK while the tube forms; from then on it is laminated to LEFT's back strip (its
  // zone part to LEFT's side flap).
  const tubeClosed = q > ASSEMBLY_PHASES.TUBE[1];
  const onLeft = (m: RigidTransform) => (tubeClosed ? compose(m, translation(flatX.LEFT - flatX.GLUE)) : glue);

  const transforms: Record<AssemblyPieceId, RigidTransform> = {
    FRONT_WALL: front,
    FRONT_TRAPEZOID: frontTrapezoid,
    FRONT_EAR_LEFT_CORNER: frontEarLeft.CORNER,
    FRONT_EAR_LEFT_DIAGONAL: frontEarLeft.DIAGONAL,
    FRONT_EAR_RIGHT_CORNER: frontEarRight.CORNER,
    FRONT_EAR_RIGHT_DIAGONAL: frontEarRight.DIAGONAL,
    BACK_WALL: back,
    BACK_TRAPEZOID: backTrapezoid,
    BACK_EAR_RIGHT_CORNER: backEarRight.CORNER,
    BACK_EAR_RIGHT_DIAGONAL: backEarRight.DIAGONAL,
    BACK_EAR_LEFT_CORNER: backEarLeft.CORNER,
    BACK_EAR_LEFT_DIAGONAL: backEarLeft.DIAGONAL,
    LEFT_WALL: left,
    LEFT_SIDE_FLAP: leftFlap,
    RIGHT_WALL: right,
    RIGHT_SIDE_FLAP: rightFlap,
    GLUE_WALL: glue,
    GLUE_BOTTOM: onLeft(leftFlap),
  };

  const tubeDone = smoothstep(getAssemblyPhaseProgress(q).TUBE);
  const sheetCentreX = (flatX.LEFT + flatX.GLUE + s) / 2;
  return {
    width: W,
    height: H,
    depth: D,
    allowance: E,
    glueFlapWidth: s,
    assemblyProgress: q,
    angles,
    flatX,
    transforms,
    view: {
      centreX: sheetCentreX + (W / 2 - sheetCentreX) * tubeDone,
      centreZ: (-D / 2) * tubeDone + 0, // + 0 turns −0 into 0
      lift: dB >= Math.PI / 2 ? 0 : E * Math.cos(dB),
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
