// Handle geometry (TWISTED_PAPER rope / FLAT_PAPER strip) in wall-local millimetres. Pure TS, no React / Three.js.
//
// Wall-local frame, identical for FRONT and BACK (handles are symmetric, so the mirror between the walls does not
// matter): x = distance from the wall's vertical centre line (W/2), y = height above the bottom fold line (panel-local
// y), both seen from INSIDE the bag. Distances off the wall surface (paper thickness) are render-only.
//
// Rules (docs/PRODUCTION.md §5, §9.5; handle entity from the catalog):
// - Patch: size from the handle entity (`getHandlePatchSize`, §9.5 fallback when missing), centred on the wall, top
//   edge `topOffset` mm below the top cut. NOTE: catalog default 80 × 50 mm vs §5/§9.5 min(170, W − 20) × 45 mm is an
//   open question to the client (docs/SPEC.md); the catalog value wins.
// - End spacing c (between the two leg centre lines): proportional to the width, c = clamp(W/2, 75, 150) (§9.5),
//   then limited so both ends (twisted: rope Ø; flat: leg + folded foot) lie under the patch with `PATCH_END_MARGIN`
//   to its side edges, and never narrower than `MIN_END_SPACING_FACTOR` × handle width.
// - Loop: the visible part above the top edge is a half-ellipse (vertical tangents where it leaves the wall) whose
//   arc length equals `handle.length`; the loop height follows from it.
// - Ends: vertical legs run down inside the wall and end under the patch. Twisted rope ends at `PATCH_END_MARGIN`
//   above the patch bottom; the flat strip's ends are folded outwards into horizontal feet glued under the patch.

import { DIELINE_RULES } from '../config/productionRules';
import { HANDLE_DEFAULTS } from '../config/productCatalog';
import { getHandlePatchSize } from '../dieline/buildDieline';
import type { Dimensions, Handle, HandleType } from '../types';

export type HandlePoint = { x: number; y: number };

/** Proportional end spacing: c = clamp(W · ratio, min, max) before the patch limit (§9.5). */
export const HANDLE_END_SPACING = { widthRatio: 0.5, min: 75, max: 150 } as const;
/** Clearance between the handle ends and the side / bottom edges of the patch, mm. */
export const PATCH_END_MARGIN = 5;
/** The two legs never come closer than this many handle widths (keeps the loop open for tiny patches). */
export const MIN_END_SPACING_FACTOR = 2;
/** Flat strip: reach of each folded foot beyond its leg centre line (to the strip end), in strip widths. */
export const FLAT_FOOT_LENGTH_FACTOR = 1.2;
/** Minimum loop height as a fraction of the end spacing (when handle.length is shorter than the spacing). */
const MIN_LOOP_HEIGHT_RATIO = 0.25;
const ELLIPSE_SEGMENTS = 64;
/** Max sampling step along straight legs / feet, mm. */
const STRAIGHT_STEP = 4;
const FILLET_SEGMENTS = 6;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
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

/** Horizontal reach of one handle end beyond its leg centre line, towards the patch side edge, mm. */
function endReach(type: HandleType, width: number): number {
  return type === 'FLAT_PAPER' ? width * FLAT_FOOT_LENGTH_FACTOR : width / 2;
}

/**
 * Distance between the two leg centre lines, mm: clamp(W/2, 75, 150), limited so both ends stay under the patch
 * (with `PATCH_END_MARGIN`) and inside the wall, but at least `MIN_END_SPACING_FACTOR` handle widths.
 */
export function getHandleEndSpacing(
  wallWidth: number,
  patchWidth: number,
  type: HandleType,
  handleWidth: number,
): number {
  const { widthRatio, min, max } = HANDLE_END_SPACING;
  const proportional = clamp(wallWidth * widthRatio, min, max);
  const reach = endReach(type, handleWidth);
  const underPatch = patchWidth - 2 * (PATCH_END_MARGIN + reach);
  const insideWall = wallWidth - 2 * (PATCH_END_MARGIN + reach);
  const spacing = Math.min(proportional, underPatch, insideWall);
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
  /** Distance between the two leg centre lines, mm. */
  endSpacing: number;
  /** Loop height above the top edge (centre line), mm. */
  loopHeight: number;
  /** y of the leg ends (twisted) or of the feet centre line (flat), mm. */
  endY: number;
  /** Flat strip: length of each folded foot from the leg centre line, mm (0 for twisted). */
  footLength: number;
  /** Corner radius of the flat strip's foot folds (centre line), mm (0 for twisted). */
  footRadius: number;
  /** Centre line from the left end over the loop to the right end (x centred on the wall), mm. */
  path: HandlePoint[];
};

/** Full handle layout on one wall (FRONT and BACK are identical). */
export function getHandleLayout(handle: Handle, dimensions: Dimensions): HandleLayout {
  const params = resolveHandleParams(handle);
  const { width: w, type } = params;
  const top = dimensions.height;
  const patch = getHandlePatchRect(handle, dimensions);
  const endSpacing = getHandleEndSpacing(dimensions.width, patch.x1 - patch.x0, type, w);
  const loopHeight = getHandleLoopHeight(endSpacing, params.length);
  const a = endSpacing / 2;
  const patchHeight = patch.y1 - patch.y0;

  const path: HandlePoint[] = [];
  let endY: number;
  let footLength = 0;
  let footRadius = 0;

  if (type === 'FLAT_PAPER') {
    footLength = endReach(type, w);
    // Strip must not fold onto itself in the corner: centre-line radius > half the strip width.
    footRadius = Math.min(w / 2 + 0.5, footLength * 0.9);
    const wanted = patch.y0 + PATCH_END_MARGIN + w / 2;
    endY = patchHeight >= w + 2 * PATCH_END_MARGIN ? wanted : (patch.y0 + patch.y1) / 2;
    endY = Math.min(endY, top - footRadius);
    // Left foot tip → fillet → leg up.
    const r = footRadius;
    path.push({ x: -a - footLength, y: endY });
    straight(path[0], { x: -a - r, y: endY }, path);
    for (let i = 1; i <= FILLET_SEGMENTS; i++) {
      const t = (Math.PI / 2) * (i / FILLET_SEGMENTS); // centre (−a − r, endY + r), from angle −90° to 0°
      path.push({ x: -a - r + r * Math.sin(t), y: endY + r - r * Math.cos(t) });
    }
    straight(path[path.length - 1], { x: -a, y: top }, path);
  } else {
    endY = Math.min(patch.y0 + PATCH_END_MARGIN, top);
    path.push({ x: -a, y: endY });
    straight(path[0], { x: -a, y: top }, path);
  }

  // Loop (skip the first ellipse point, it equals the leg top), then mirror the left half for the right leg.
  path.push(...ellipsePoints(a, loopHeight, top).slice(1));
  const leftLeg = path.slice(0, path.length - ELLIPSE_SEGMENTS - 1);
  for (let i = leftLeg.length - 1; i >= 0; i--) path.push({ x: -leftLeg[i].x, y: leftLeg[i].y });

  return { params, patch, endSpacing, loopHeight, endY, footLength, footRadius, path };
}
