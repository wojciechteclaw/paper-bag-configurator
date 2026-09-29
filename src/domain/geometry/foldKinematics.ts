// Fold kinematics of the block-bottom bag, p ∈ [0, 1] (0 = standing open box, 1 = folded flat).
// Closed-form model from docs/PRODUCTION.md §10.5 — pure maths in millimetres, no React / Three.js.
//
// World frame (docs/PRODUCTION.md §3.1): x to the right (0…W along FRONT, LEFT side at x = 0), y up,
// z towards the viewer. FRONT is fixed in the plane z = 0; the standing BACK is at z = −D.
//
//   ψ(p) = π·p                         BACK_LOWER strip angle on the pleat y = D/2 (0 → 180°)
//   φ(p) = asin(sin²(ψ/2))             bottom rotation on the FRONT bottom crease (0 → 90°)
//   g(p) = D·(cos φ − ½·sin ψ)         front–back distance (D → 0)
//   θ(p) = acos(g/D)                   side-gusset fold angle (0 → 90°)
//
// All large panels move rigidly. SIDE_T and SIDE_BACK_LOWER are driven affinely by their three vertices: the only
// edge that changes length is the back 45° crease B0–A (≤ ~21 % around p ≈ 0.3, 0 % at both ends) — the paper bag is
// not rigidly foldable (Balkcom et al.), see docs/PRODUCTION.md §3.5.
// At p = 1 the bottom lies on the OUTSIDE of BACK (hinged on the front bottom crease) and BACK is Z-folded at y = D/2.

import type { Dimensions } from '../types';
import type { FoldPanelId, FoldRegionId } from './blockBottom';

export type Vec3 = { x: number; y: number; z: number };

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

export type FoldAngles = {
  /** Angle of the BACK_LOWER strip on the pleat y = D/2, radians (0 → π). */
  psi: number;
  /** Rotation of the bottom on the front bottom crease, radians (0 → π/2). */
  phi: number;
  /** Side-gusset fold angle, radians (0 → π/2). */
  theta: number;
  /** Front–back distance as a fraction of the depth, g/D (1 → 0). */
  frontBackRatio: number;
};

/** The four fold functions of docs/PRODUCTION.md §10.5 (p is clamped to [0, 1]; NaN → 0). */
export function getFoldAngles(foldProgress: number): FoldAngles {
  const p = clamp01(foldProgress);
  const psi = Math.PI * p;
  const phi = Math.asin(Math.min(1, Math.sin(psi / 2) ** 2));
  const frontBackRatio = Math.min(1, Math.max(0, Math.cos(phi) - 0.5 * Math.sin(psi)));
  return { psi, phi, theta: Math.acos(frontBackRatio), frontBackRatio };
}

/** Everything needed to place points for one fold state (computed once per frame, then reused per vertex). */
export type FoldPose = FoldAngles & {
  width: number;
  height: number;
  depth: number;
  foldProgress: number;
  /** Half depth D/2 (height of the diamond apex and of the pleat). */
  half: number;
  /** Front–back distance g, mm. */
  gap: number;
  sinTheta: number;
  cosTheta: number;
  /** Control vertices of the LEFT side (x = 0); RIGHT is the mirror x → W − x. */
  controls: {
    /** Front bottom corner (fixed). */
    F0: Vec3;
    /** Back bottom corner. */
    B0: Vec3;
    /** End of the side pleat on the back edge. */
    K: Vec3;
    /** Diamond apex on the centre crease. */
    A: Vec3;
  };
};

export function getFoldPose(dimensions: Dimensions, foldProgress: number): FoldPose {
  const { width, height, depth } = dimensions;
  const angles = getFoldAngles(foldProgress);
  const half = depth / 2;
  const gap = depth * angles.frontBackRatio;
  const sinTheta = Math.sin(angles.theta);
  const cosTheta = Math.cos(angles.theta);
  return {
    ...angles,
    width,
    height,
    depth,
    foldProgress: clamp01(foldProgress),
    half,
    gap,
    sinTheta,
    cosTheta,
    controls: {
      F0: { x: 0, y: 0, z: 0 },
      B0: { x: 0, y: depth * Math.sin(angles.phi), z: -depth * Math.cos(angles.phi) },
      K: { x: 0, y: half, z: -gap },
      A: { x: half * sinTheta, y: half, z: -gap / 2 },
    },
  };
}

function affine(out: Vec3, a: Vec3, wa: number, b: Vec3, wb: number, c: Vec3, wc: number): Vec3 {
  out.x = a.x * wa + b.x * wb + c.x * wc;
  out.y = a.y * wa + b.y * wb + c.y * wc;
  out.z = a.z * wa + b.z * wb + c.z * wc;
  return out;
}

/** LEFT-side point (u from the BACK edge) of a side region. */
function foldLeftSide(pose: FoldPose, region: FoldRegionId, u: number, v: number, out: Vec3): Vec3 {
  const { depth: D, half: h, sinTheta, cosTheta, gap, controls } = pose;
  switch (region) {
    case 'SIDE_FRONT': {
      const t = D - u; // distance from the FRONT edge (hinge)
      out.x = t * sinTheta;
      out.y = v;
      out.z = -t * cosTheta;
      return out;
    }
    case 'SIDE_BACK_UPPER': {
      out.x = u * sinTheta; // u = distance from the BACK edge (hinge)
      out.y = v;
      out.z = -gap + u * cosTheta;
      return out;
    }
    case 'SIDE_T': {
      // local (0,0) → B0, (D,0) → F0, (h,h) → A
      const wA = h > 0 ? v / h : 0;
      const wF = D > 0 ? (u - wA * h) / D : 0;
      return affine(out, controls.B0, 1 - wA - wF, controls.F0, wF, controls.A, wA);
    }
    case 'SIDE_BACK_LOWER': {
      // local (0,0) → B0, (0,h) → K, (h,h) → A
      const wA = h > 0 ? u / h : 0;
      const wK = h > 0 ? v / h - wA : 0;
      return affine(out, controls.B0, 1 - wA - wK, controls.K, wK, controls.A, wA);
    }
    default:
      throw new Error(`Region ${region} is not a side region`);
  }
}

/**
 * World position (mm, frame above) of the panel-local point (u, v) of `region` on `panel` for the given pose.
 * Panel-local coordinates as in `blockBottom.ts` (seen from outside; BOTTOM seen from below). Writes into `out`
 * (no allocation — called per vertex per frame) and returns it.
 */
export function foldPoint(
  pose: FoldPose,
  panel: FoldPanelId,
  region: FoldRegionId,
  u: number,
  v: number,
  out: Vec3 = { x: 0, y: 0, z: 0 },
): Vec3 {
  const { width: W, half: h, gap } = pose;
  switch (panel) {
    case 'FRONT':
      out.x = u;
      out.y = v;
      out.z = 0;
      return out;
    case 'BACK':
      out.x = W - u;
      if (region === 'BACK_LOWER') {
        const r = h - v; // distance below the pleat
        out.y = h - r * Math.cos(pose.psi);
        out.z = -gap - r * Math.sin(pose.psi);
      } else {
        out.y = v;
        out.z = -gap;
      }
      return out;
    case 'BOTTOM': {
      const t = pose.depth - v; // distance from the front bottom crease (hinge)
      out.x = u;
      out.y = t * Math.sin(pose.phi);
      out.z = -t * Math.cos(pose.phi);
      return out;
    }
    case 'LEFT':
      return foldLeftSide(pose, region, u, v, out);
    case 'RIGHT': {
      // RIGHT (u from FRONT) is the mirror of LEFT (u from BACK): u → D − u, x → W − x.
      foldLeftSide(pose, region, pose.depth - u, v, out);
      out.x = W - out.x;
      return out;
    }
  }
}

/** A crease acting as a hinge between two regions, with its current dihedral angle (π = flat, 0 = folded shut). */
export type FoldHinge = {
  regions: readonly [FoldRegionId, FoldRegionId];
  side?: 'LEFT' | 'RIGHT';
  /** A point on the hinge line (world mm). */
  origin: Vec3;
  /** Unit direction of the hinge line. */
  direction: Vec3;
  /** Interior dihedral angle between the two regions, radians (docs/PRODUCTION.md §10.6). */
  dihedral: number;
};

/** Hinge axes of the rigid regions and their dihedral angles (docs/PRODUCTION.md §10.5–10.6). */
export function getFoldHinges(pose: FoldPose): FoldHinge[] {
  const { width: W, half: h, gap, theta, psi, phi } = pose;
  const X: Vec3 = { x: 1, y: 0, z: 0 };
  const Y: Vec3 = { x: 0, y: 1, z: 0 };
  const hinges: FoldHinge[] = [
    { regions: ['FRONT', 'BOTTOM'], origin: { x: 0, y: 0, z: 0 }, direction: X, dihedral: Math.PI / 2 - phi },
    { regions: ['BACK_UPPER', 'BACK_LOWER'], origin: { x: 0, y: h, z: -gap }, direction: X, dihedral: Math.PI - psi },
    {
      regions: ['BACK_LOWER', 'BOTTOM'],
      origin: { ...pose.controls.B0 },
      direction: X,
      dihedral: Math.PI / 2 - psi + phi,
    },
  ];
  for (const side of ['LEFT', 'RIGHT'] as const) {
    const x = side === 'LEFT' ? 0 : W;
    const apexX = side === 'LEFT' ? pose.controls.A.x : W - pose.controls.A.x;
    hinges.push(
      { regions: ['FRONT', 'SIDE_FRONT'], side, origin: { x, y: 0, z: 0 }, direction: Y, dihedral: Math.PI / 2 - theta },
      {
        regions: ['BACK_UPPER', 'SIDE_BACK_UPPER'],
        side,
        origin: { x, y: 0, z: -gap },
        direction: Y,
        dihedral: Math.PI / 2 - theta,
      },
      {
        regions: ['SIDE_FRONT', 'SIDE_BACK_UPPER'],
        side,
        origin: { x: apexX, y: h, z: -gap / 2 },
        direction: Y,
        dihedral: Math.PI - 2 * theta,
      },
    );
  }
  return hinges;
}

/**
 * Inclination of the side's bottom triangle SIDE_T from the vertical, radians: the angle between the world up axis
 * and the triangle's height vector (midpoint of its bottom edge B0–F0 → apex A). 0 in the open box (T stands in the
 * side wall), π/2 when folded flat (T lies in the flat-bag plane).
 */
export function getSideTriangleTilt(pose: FoldPose): number {
  const { A, B0, F0 } = pose.controls;
  const mx = (A.x - (B0.x + F0.x) / 2);
  const my = (A.y - (B0.y + F0.y) / 2);
  const mz = (A.z - (B0.z + F0.z) / 2);
  const len = Math.hypot(mx, my, mz);
  return len > 0 ? Math.acos(Math.min(1, Math.max(-1, my / len))) : 0;
}

/** Target tilt of SIDE_T for the "standing" preview preset (docs/SPEC.md §4c: bottom triangle ≈ 45°). */
export const STANDING_TRIANGLE_TILT = Math.PI / 4;

/**
 * Fold progress of the "naturally standing" bag (docs/SPEC.md §4c): the p at which the side's bottom triangle SIDE_T
 * is inclined by `tilt` (default 45°) from the vertical. The tilt only depends on p (every length scales with D), so
 * the result is independent of the dimensions. Solved by bisection; the tilt grows monotonically from 0 (p = 0) to
 * 90° (p = 1). For 45° the root is p ≈ 0.2497 (θ ≈ 50.4°, bottom lifted at the back by φ ≈ 8.4°).
 */
export function getStandingFoldProgress(tilt: number = STANDING_TRIANGLE_TILT): number {
  const unit = { width: 2, height: 2, depth: 1 };
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (getSideTriangleTilt(getFoldPose(unit, mid)) < tilt) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
