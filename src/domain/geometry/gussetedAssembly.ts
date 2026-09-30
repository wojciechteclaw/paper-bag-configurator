// Gusseted bag (FOLDED): forming from the printed sheet as on the machine, arriving at the open bag of the gusseted
// model (gussetedBag.ts) — pure maths in millimetres (docs/SPEC.md §4i, docs/PRODUCTION.md §13.7). Client [K]
// 30.09.2026: the same timeline shape as the block bottom — forming 0 → 60 % ending in the open bag ("3D pełne"),
// then the existing open → flat fold of the gusseted model.
//
// Assembly progress q ∈ [0, 1] (timeline 0 → 0.6, `GUSSETED_TIMELINE_SHARE`), strictly sequential phases:
//
//   TUCK    q ∈ [0.00, 0.25]  tucking knives: both gussets pleat in by F/2 — the tube edges FRONT|RF, FRONT|LF fold
//                             180° (out), the gusset centres 180° back (in); RB / LB end parallel to FRONT, BACK and
//                             the seam flap slide along flat with RB
//   WRAP    q ∈ [0.25, 0.50]  BACK wraps 180° behind on the RIGHT|BACK edge; the seam flap folds onto BACK's inside
//                             first (C3), so BACK lands with the flap under LB's free edge: the flat tube, seam closed on
//                             the BACK|LEFT edge
//   BOTTOM  q ∈ [0.50, 0.75]  the bottom strip d (every layer, flap included) folds 180° TO THE BACK
//   OPEN    q ∈ [0.75, 1.00]  the finished flat bag opens into the open bag of the gusseted model (open 0 → 1)
//
// Then (q = 1) the fold progress p closes it again exactly like the gusseted model (open = 1 − p).
//
// TUCK and WRAP are rigid: the sheet (LEFT | FRONT | RIGHT | BACK | s, `buildGussetedDieline`) is a chain of rigid
// links — FRONT (fixed in the sheet plane z = 0), the gusset halves RF, RB, LF, LB, BACK and the flap — turning about
// vertical creases, so every hinge stays closed. They end in the gusseted model's flat tube; BOTTOM and OPEN are the
// gusseted model itself (`getGussetedPoint`, with the strip turned by `stripTurn`), so the result at q = 1 is exactly the
// open bag the fold starts from (test). The render-only layer gap of that model (`gap`, mm) fades in while the gussets
// tuck (the sheet stays exactly flat). The flap follows LB (glued inside it) from the end of WRAP on, offset inwards by
// min(0.1 mm, gap · u / F) (half the distance to BACK in the flat tube, so it never shows through BACK).
//
// Frame (mm) as gussetedBag.ts: origin at the centre of the bottom fold line, x to the RIGHT wall, y up, z to FRONT.
// Panel-local coordinates are the dieline's (seen from outside; LEFT x = 0 at BACK, RIGHT x = 0 at FRONT); the flap
// uses u ∈ [0, s] from its hinge on BACK's x = W edge.

import { getBottomFoldDepth, getGussetedPoint, type GussetedDimensions, type Vec3 } from './gussetedBag';
import type { PanelPosition } from '../types';

/** A part of the sheet: a wall, or the seam flap. */
export type GussetedSheetPart = PanelPosition | 'GLUE';

type Dims = Pick<GussetedDimensions, 'width' | 'height' | 'depth' | 'bottomFold'>;

/** Largest render-only inward offset of the seam flap from LB, mm (client limit ≤ 0.1 mm per layer). */
export const GUSSETED_FLAP_LAYER_MM = 0.1;

/** Seam flap width used in 3D: the dieline's s, at most F/2 (it lies inside LB, the gusset half next to BACK). */
export function getGussetedFlapWidth(d: Pick<Dims, 'depth'>, glueFlapWidth: number): number {
  return Math.max(0, Math.min(Number.isFinite(glueFlapWidth) ? glueFlapWidth : 0, d.depth / 2));
}

/** Sheet x of each part's panel-local x = 0 (LEFT | FRONT | RIGHT | BACK | flap, as `buildGussetedDieline`). */
export function getGussetedSheetOrigins(d: Pick<Dims, 'width' | 'depth'>): Record<GussetedSheetPart, number> {
  const { width: W, depth: F } = d;
  return { LEFT: 0, FRONT: F, RIGHT: F + W, BACK: 2 * F + W, GLUE: 2 * F + 2 * W };
}

// ——— Phases ———

export type GussetedPhaseId = 'TUCK' | 'WRAP' | 'BOTTOM' | 'OPEN';

/** Sub-ranges of the assembly progress q per phase. */
export const GUSSETED_PHASES: Readonly<Record<GussetedPhaseId, readonly [number, number]>> = {
  TUCK: [0, 0.25],
  WRAP: [0.25, 0.5],
  BOTTOM: [0.5, 0.75],
  OPEN: [0.75, 1],
};

const PHASE_IDS = Object.keys(GUSSETED_PHASES) as GussetedPhaseId[];

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);
const smooth = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

/** Linear progress 0..1 of every phase at q. */
export function getGussetedPhaseProgress(assemblyProgress: number): Record<GussetedPhaseId, number> {
  const q = clamp01(assemblyProgress);
  const out = {} as Record<GussetedPhaseId, number>;
  for (const id of PHASE_IDS) {
    const [from, to] = GUSSETED_PHASES[id];
    out[id] = clamp01((q - from) / (to - from));
  }
  return out;
}

/** The phase running at q (its start inclusive); q = 1 → OPEN. */
export function getGussetedPhase(assemblyProgress: number): GussetedPhaseId {
  const q = clamp01(assemblyProgress);
  return PHASE_IDS.find((id) => q < GUSSETED_PHASES[id][1]) ?? 'OPEN';
}

// ——— Preview timeline: forming (sheet → open bag), then the gusseted model's fold (open → flat) ———

/**
 * Share of the gusseted preview timeline taken by the forming (client [K] 30.09.2026: more room than the block bottom's
 * 0.4 for its four phases): sheet 0, wrap 15 %, bottom 30 %, opening 45 %, open bag 60 % (BOX), flat 100 %.
 */
export const GUSSETED_TIMELINE_SHARE = 0.6;

/** Timeline t ∈ [0, 1] → forming progress q and fold progress p (q < 1 ⇒ p = 0; p > 0 ⇒ q = 1). */
export function splitGussetedTimeline(timeline: number): { assemblyProgress: number; foldProgress: number } {
  const t = clamp01(timeline);
  if (t < GUSSETED_TIMELINE_SHARE) return { assemblyProgress: t / GUSSETED_TIMELINE_SHARE, foldProgress: 0 };
  return { assemblyProgress: 1, foldProgress: (t - GUSSETED_TIMELINE_SHARE) / (1 - GUSSETED_TIMELINE_SHARE) };
}

/** Inverse of `splitGussetedTimeline`. */
export function toGussetedTimeline(assemblyProgress: number, foldProgress: number): number {
  const q = clamp01(assemblyProgress);
  return q < 1 ? q * GUSSETED_TIMELINE_SHARE : GUSSETED_TIMELINE_SHARE + clamp01(foldProgress) * (1 - GUSSETED_TIMELINE_SHARE);
}

// ——— Rigid links (TUCK, WRAP) ———

type Link = 'FRONT' | 'RF' | 'RB' | 'BACK' | 'GLUE' | 'LB' | 'LF';
/** Rotation about the vertical axis by φ (φ > 0 turns behind the sheet, towards −z) with local x = xRef at (ox, oz). */
type LinkPose = { c: number; s: number; xRef: number; ox: number; oz: number };

const linkPose = (phi: number, xRef: number, ox: number, oz: number): LinkPose => ({ c: Math.cos(phi), s: Math.sin(phi), xRef, ox, oz });

function linkOf(part: GussetedSheetPart, x: number, F: number): Link {
  switch (part) {
    case 'RIGHT':
      return x <= F / 2 ? 'RF' : 'RB';
    case 'LEFT':
      return x <= F / 2 ? 'LB' : 'LF';
    default:
      return part;
  }
}

// ——— Pose ———

export type GussetedAngles = {
  /** Gusset pleat (tube edges FRONT|RF, FRONT|LF and the gusset centres), 0 → π. */
  tuck: number;
  /** BACK wrapped behind on the RIGHT|BACK edge, 0 → π. */
  wrap: number;
  /** Seam flap folded onto BACK's inside (C3), 0 → π. */
  flap: number;
};

export type GussetedPose = {
  dimensions: Dims;
  bottomFold: number;
  glueFlapWidth: number;
  assemblyProgress: number;
  foldProgress: number;
  /** Render-only layer gap of the gusseted model, mm (0 = exact geometry). */
  gap: number;
  stage: 'CHAIN' | 'MODEL';
  angles: GussetedAngles;
  /** Bottom strip fold 0..1 (gusseted model `stripTurn`). */
  stripTurn: number;
  /** Opening of the gusseted model 0..1 (0 = flat, 1 = open). */
  open: number;
  /** 0..1 fade of the layer gap while the gussets tuck (the flat sheet stays exactly flat). */
  layerFade: number;
  links: Record<Link, LinkPose>;
  /**
   * Suggested view placement (render-only): the model x to centre (sheet centre → bag centre while BACK wraps) and the
   * lift that keeps the hanging strip on the floor (d, 0 once the strip is folded past horizontal).
   */
  view: { centreX: number; lift: number };
};

/**
 * Pose of the gusseted timeline: `assemblyProgress` q (forming from the sheet, ending in the open bag) and, once
 * q = 1, `foldProgress` p (open → flat, the gusseted model's fold; open = 1 − p).
 */
export function getGussetedPose(
  d: Dims,
  glueFlapWidth: number,
  assemblyProgress: number,
  foldProgress = 0,
  gap = 0,
): GussetedPose {
  const { width: W, depth: F } = d;
  const b = getBottomFoldDepth(d);
  const s = getGussetedFlapWidth(d, glueFlapWidth);
  const q = clamp01(assemblyProgress);
  const p = q < 1 ? 0 : clamp01(foldProgress);
  const phase = getGussetedPhaseProgress(q);
  const angles: GussetedAngles = {
    tuck: Math.PI * smooth(phase.TUCK),
    wrap: Math.PI * smooth(phase.WRAP),
    flap: Math.PI * smooth(phase.WRAP / 0.6),
  };
  const { tuck: psi, wrap: omega, flap: chi } = angles;
  const stripTurn = smooth(phase.BOTTOM);
  const open = q < 1 ? smooth(phase.OPEN) : 1 - p;
  const stage = q < GUSSETED_PHASES.WRAP[1] ? 'CHAIN' : 'MODEL';

  // Links, FRONT fixed in the sheet plane z = 0 (x ∈ [−W/2, W/2]); pleats hang behind it (−z).
  const ax = W / 2 + (F / 2) * Math.cos(psi);
  const az = -(F / 2) * Math.sin(psi);
  const e2x = ax + F / 2;
  const gx = e2x + W * Math.cos(omega);
  const gz = az - W * Math.sin(omega);
  const aLx = -W / 2 - (F / 2) * Math.cos(psi);
  const links: Record<Link, LinkPose> = {
    FRONT: linkPose(0, 0, -W / 2, 0),
    RF: linkPose(psi, 0, W / 2, 0),
    RB: linkPose(0, F / 2, ax, az),
    BACK: linkPose(omega, 0, e2x, az),
    GLUE: linkPose(omega + chi, 0, gx, gz),
    LF: linkPose(-psi, F, -W / 2, 0),
    LB: linkPose(0, F / 2, aLx, az),
  };

  return {
    dimensions: d,
    bottomFold: b,
    glueFlapWidth: s,
    assemblyProgress: q,
    foldProgress: p,
    gap: Number.isFinite(gap) ? Math.max(0, gap) : 0,
    stage,
    angles,
    stripTurn,
    open,
    layerFade: smooth(phase.TUCK),
    links,
    view: {
      centreX: ((W + s) / 2) * (1 - smooth(phase.WRAP)),
      lift: q >= GUSSETED_PHASES.OPEN[0] ? 0 : b * Math.max(0, Math.cos(Math.PI * stripTurn)),
    },
  };
}

const add = (a: Vec3, b: Vec3, k = 1): Vec3 => ({ x: a.x + k * b.x, y: a.y + k * b.y, z: a.z + k * b.z });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
function unit(a: Vec3): Vec3 {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}

/** The gusseted model's point (open, gap, strip turn of the pose). */
function modelPoint(pose: GussetedPose, panel: PanelPosition, x: number, y: number, open = pose.open, stripTurn = pose.stripTurn): Vec3 {
  return getGussetedPoint(pose.dimensions, panel, { x, y }, open, pose.gap, stripTurn);
}

/** Render-only inward offset of the flap from LB at u, mm (0 without a gap). */
function flapOffset(pose: GussetedPose, u: number): number {
  const F = pose.dimensions.depth;
  return F > 0 ? Math.min(GUSSETED_FLAP_LAYER_MM, (pose.gap * Math.max(0, u)) / F) : 0;
}

/** LB's point at (u, y) plus the flap offset along its inward normal (finite differences on the model surface). */
function flapOnLb(pose: GussetedPose, u: number, y: number, open: number, stripTurn: number): Vec3 {
  const point = modelPoint(pose, 'LEFT', u, y, open, stripTurn);
  const offset = flapOffset(pose, u);
  if (offset <= 0) return point;
  const h = 0.05;
  const F = pose.dimensions.depth;
  const x1 = Math.min(u + h, F / 2);
  const x0 = x1 - h;
  const [y0, y1] = y < 0 ? [y - h, y] : [y, y + h];
  const dx = sub(modelPoint(pose, 'LEFT', x1, y, open, stripTurn), modelPoint(pose, 'LEFT', x0, y, open, stripTurn));
  const dy = sub(modelPoint(pose, 'LEFT', u, y1, open, stripTurn), modelPoint(pose, 'LEFT', u, y0, open, stripTurn));
  // Panel-local x right, y up, seen from outside: ∂x × ∂y points out of the paper's print side.
  return add(point, unit(cross(dx, dy)), -offset);
}

/**
 * Position (mm, bag frame) of the panel-local point (x, y) of a sheet part (flap: u, y) at the pose — continuous in
 * q and p, every hinge closed at gap 0 (tests).
 */
export function gussetedPosePoint(pose: GussetedPose, part: GussetedSheetPart, x: number, y: number): Vec3 {
  if (pose.stage === 'MODEL') {
    return part === 'GLUE' ? flapOnLb(pose, x, y, pose.open, pose.stripTurn) : modelPoint(pose, part, x, y);
  }
  const F = pose.dimensions.depth;
  const l = pose.links[linkOf(part, x, F)];
  const lx = x - l.xRef;
  const rigid = { x: l.ox + l.c * lx, y, z: l.oz - l.s * lx };
  if (pose.gap <= 0 || pose.layerFade <= 0) return rigid;
  // Render layers: the displacement of the gusseted model's flat tube (layer gap) from the exact flat tube, faded in.
  const exact = { ...pose, gap: 0 };
  const layered = part === 'GLUE' ? flapOnLb(pose, x, 0, 0, 0) : modelPoint(pose, part, x, 0, 0, 0);
  const bare = part === 'GLUE' ? modelPoint(exact, 'LEFT', x, 0, 0, 0) : modelPoint(exact, part, x, 0, 0, 0);
  return add(rigid, sub(layered, bare), pose.layerFade);
}
