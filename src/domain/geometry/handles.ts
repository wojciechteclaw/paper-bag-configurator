// Handle geometry (TWISTED_PAPER rope / FLAT_PAPER strip) in wall-local millimetres. Pure TS, no React / Three.js.
//
// Wall-local frame, identical for FRONT and BACK (handles are symmetric, so the mirror between the walls does not
// matter): x = distance from the wall's vertical centre line (W/2), y = height above the bottom fold line (panel-local
// y), both seen from INSIDE the bag. Distances off the wall surface (paper thickness) are render-only.
//
// Client rules [K] (docs/PRODUCTION.md §5, §9.5), same for both handle types:
// - Patch 100 × 20 mm (handle entity / DIELINE_RULES.handlePatch), centred on the wall, top edge 20 mm below the top
//   cut → y ∈ [H − 40, H − 20], x ∈ [−50, 50]. On narrow walls (W < 110) clamped to W − 2·5 mm (getHandlePatchSize).
// - The handle is always 90 mm wide measured over its outer edges (HANDLE_OUTER_WIDTH_MM) [K], and the patch sticks
//   out 10 mm past the handle on each side (PATCH_OVERHANG_MM) [K] → patch width 90 + 2·10 = 110 mm.
//   End spacing c (between the two leg centre lines) = 90 − handle width: rope Ø5 → 85 mm, 20 mm strip → 70 mm.
//   Guard: on narrow walls (clamped patch) c shrinks so the overhang is kept where possible (never below the minimum)
//   and the layout reports `endSpacingReduced`.
// - Both types end the same way: vertical legs run down behind the patch and end `PATCH_END_MARGIN` above its bottom
//   edge (glued under it).
// - Loop: the visible part above the top edge is a half-ellipse (vertical tangents where it leaves the wall), always
//   HANDLE_LOOP_HEIGHT_MM = 50 mm high [K]; its arc length (`loopLength`) follows from the height and the spacing.

import { DIELINE_RULES } from '../config/productionRules';
import { HANDLE_DEFAULTS } from '../config/productCatalog';
import { getHandlePatchSize } from '../dieline/buildDieline';
import type { Dimensions, Handle, HandleType, Paper, PaperColor } from '../types';

/**
 * Handles (rope / strip) and their patches are made of the same paper colour as the bag — white or brown [K].
 */
export function getHandlePaperColor(paper: Pick<Paper, 'color'>): PaperColor {
  return paper.color;
}

export type HandlePoint = { x: number; y: number };

/** Width of the handle over its outer edges, mm [K] — independent of the wall width and of the handle type. */
export const HANDLE_OUTER_WIDTH_MM = 90;
/** Height of the handle loop above the top edge (centre line), mm [K]. */
export const HANDLE_LOOP_HEIGHT_MM = 50;
/** How far the patch sticks out past the handle on each side, mm [K]. */
export const PATCH_OVERHANG_MM = 10;
/** Leg centre-line spacing for a handle of the given width (rope diameter / strip width), mm. */
export const handleEndSpacingFor = (handleWidth: number) => HANDLE_OUTER_WIDTH_MM - handleWidth;
/** Clearance between the handle ends and the bottom edge of the patch, mm. */
export const PATCH_END_MARGIN = 5;
/** The two legs never come closer than this many handle widths (keeps the loop open for tiny patches). */
export const MIN_END_SPACING_FACTOR = 2;
/** Minimum loop height as a fraction of the end spacing (when handle.length is shorter than the spacing). */
const MIN_LOOP_HEIGHT_RATIO = 0.25;
const ELLIPSE_SEGMENTS = 64;
/** Max sampling step along straight legs, mm. */
const STRAIGHT_STEP = 4;

const positive = (value: number | undefined, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;

export type HandleParams = {
  type: HandleType;
  /** Rope diameter (twisted) or strip width (flat), mm. */
  width: number;
  /** Visible loop length above the top edge, mm. */
  length: number;
  color: string;
};

/** Handle parameters with the catalog defaults filled in (missing or non-positive values fall back). */
export function resolveHandleParams(handle: Handle): HandleParams {
  const defaults = HANDLE_DEFAULTS[handle.type] ?? HANDLE_DEFAULTS.TWISTED_PAPER;
  return {
    type: handle.type,
    width: positive(handle.width, positive(defaults.width, 5)),
    length: positive(handle.length, positive(defaults.length, 180)),
    color: handle.color || defaults.color || '#c8a57a',
  };
}

/** Patch rectangle in wall-local mm (x centred on the wall). */
export type HandlePatchRect = { x0: number; x1: number; y0: number; y1: number };

export function getHandlePatchRect(handle: Handle, dimensions: Dimensions): HandlePatchRect {
  const { width: W, height: H } = dimensions;
  const size = getHandlePatchSize(handle, W);
  const y1 = H - DIELINE_RULES.handlePatch.topOffset;
  const y0 = Math.max(0, y1 - size.height);
  return { x0: -size.width / 2, x1: size.width / 2, y0, y1 };
}

/**
 * Distance between the two leg centre lines, mm: 80 mm outer handle width minus the handle width [K], so the patch
 * overhangs the handle by PATCH_OVERHANG_MM on each side. Only when the patch (or the wall) is too narrow is it reduced
 * (keeping the overhang, then at least flush with the patch sides); never below `MIN_END_SPACING_FACTOR` widths.
 */
export function getHandleEndSpacing(wallWidth: number, patchWidth: number, handleWidth: number): number {
  const spacing = Math.min(
    handleEndSpacingFor(handleWidth),
    Math.max(patchWidth - 2 * PATCH_OVERHANG_MM, 0) - handleWidth,
    wallWidth - handleWidth,
  );
  return Math.max(spacing, MIN_END_SPACING_FACTOR * handleWidth);
}

/** Points of the half-ellipse loop from (−a, top) over (0, top + b) to (a, top). */
function ellipsePoints(a: number, b: number, top: number, segments = ELLIPSE_SEGMENTS): HandlePoint[] {
  const points: HandlePoint[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = Math.PI * (1 - i / segments);
    points.push({ x: a * Math.cos(t), y: top + b * Math.sin(t) });
  }
  return points;
}

export function polylineLength(points: readonly HandlePoint[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return length;
}

/**
 * Height of the half-elliptic loop above the top edge whose arc length is `loopLength` for the given end spacing
 * (bisection on the sampled arc). Never lower than `MIN_LOOP_HEIGHT_RATIO` × spacing.
 */
export function getHandleLoopHeight(endSpacing: number, loopLength: number): number {
  const a = Math.max(0, endSpacing / 2);
  const minHeight = MIN_LOOP_HEIGHT_RATIO * endSpacing;
  if (!(loopLength > 0) || a === 0) return Math.max(0, minHeight);
  const arc = (b: number) => polylineLength(ellipsePoints(a, b, 0));
  if (arc(minHeight) >= loopLength) return minHeight;
  let lo = minHeight;
  let hi = loopLength / 2; // arc ≥ 2b, so b = L/2 is always long enough
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (arc(mid) < loopLength) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function straight(from: HandlePoint, to: HandlePoint, out: HandlePoint[]) {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / STRAIGHT_STEP));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    out.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
  }
}

export type HandleLayout = {
  params: HandleParams;
  patch: HandlePatchRect;
  /** Distance between the two leg centre lines, mm (90 − handle width unless reduced). */
  endSpacing: number;
  /** True when the wall / patch is too narrow for the fixed spacing and it had to be reduced (narrow walls). */
  endSpacingReduced: boolean;
  /** Loop height above the top edge (centre line), mm — HANDLE_LOOP_HEIGHT_MM [K]. */
  loopHeight: number;
  /** Arc length of the visible loop (centre line), mm — derived from the fixed height and the spacing. */
  loopLength: number;
  /** y of the leg ends (both types end vertically under the patch), mm. */
  endY: number;
  /** Centre line from the left end over the loop to the right end (x centred on the wall), mm. */
  path: HandlePoint[];
};

/** Full handle layout on one wall (FRONT and BACK are identical). */
export function getHandleLayout(handle: Handle, dimensions: Dimensions): HandleLayout {
  const params = resolveHandleParams(handle);
  const top = dimensions.height;
  const patch = getHandlePatchRect(handle, dimensions);
  const endSpacing = getHandleEndSpacing(dimensions.width, patch.x1 - patch.x0, params.width);
  const loopHeight = HANDLE_LOOP_HEIGHT_MM;
  const a = endSpacing / 2;
  const loopLength = polylineLength(ellipsePoints(a, loopHeight, 0));

  // Ends: PATCH_END_MARGIN above the patch bottom, but always under the patch (tiny patches: its middle).
  const endY = Math.min(patch.y0 + PATCH_END_MARGIN, (patch.y0 + patch.y1) / 2, top);

  const path: HandlePoint[] = [{ x: -a, y: endY }];
  straight(path[0], { x: -a, y: top }, path);
  // Loop (skip the first ellipse point, it equals the leg top), then mirror the left leg for the right one.
  path.push(...ellipsePoints(a, loopHeight, top).slice(1));
  const leftLeg = path.slice(0, path.length - ELLIPSE_SEGMENTS - 1);
  for (let i = leftLeg.length - 1; i >= 0; i--) path.push({ x: -leftLeg[i].x, y: leftLeg[i].y });

  return {
    params,
    patch,
    endSpacing,
    endSpacingReduced: endSpacing < handleEndSpacingFor(params.width),
    loopHeight,
    loopLength,
    endY,
    path,
  };
}
