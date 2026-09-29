// Bottom-forming conditions of the block bottom (client spec [K], docs/PRODUCTION.md §3.2, §3.4).
//
//   E  = bottom allowance under every wall (flap depth), E = (OV + D) / 2
//   OV = overlap of the front and back bottom flaps, OV = 2E − D (glued; client value 30 mm)
//   D/2 = depth of the apex of the side triangle below the bottom line
//
// The bottom closes only when the side triangle fits into the allowance (apex D/2 ≤ E, i.e. E ≥ D/2) and the two
// flaps overlap (OV > 0) so that there is a glue band. With the client rule E = (D + 30) / 2 both always hold; the
// helpers exist so a future custom allowance / overlap is validated in one place.

import { BOTTOM_ALLOWANCE_EXTRA_MM } from '../config/productionRules';
import { isBottomTrapezoidDegenerate } from '../geometry/blockBottom';
import type { Dimensions } from '../types';

export type BottomFlapIssue =
  /** E < D/2: the side triangle (apex D/2 below the bottom line) does not fit into the allowance. */
  | 'ALLOWANCE_BELOW_HALF_DEPTH'
  /** OV = 2E − D ≤ 0: the front and back flaps do not overlap — no glue band, the bottom stays open. */
  | 'NO_FLAP_OVERLAP';

export type BottomFlapGeometry = {
  /** Flap depth E (bottom allowance), mm. */
  allowance: number;
  /** Flap overlap OV = 2E − D, mm. */
  overlap: number;
  /** Depth of the side-triangle apex below the bottom line, D/2, mm. */
  apexDepth: number;
};

/** Allowance E for a wanted flap overlap: E = (OV + D) / 2 (client spec; OV defaults to the client's 30 mm). */
export function getAllowanceForOverlap(depth: number, overlap: number = BOTTOM_ALLOWANCE_EXTRA_MM): number {
  return (overlap + depth) / 2;
}

export function getBottomFlapGeometry(depth: number, allowance: number = getAllowanceForOverlap(depth)): BottomFlapGeometry {
  return { allowance, overlap: 2 * allowance - depth, apexDepth: depth / 2 };
}

/**
 * Checks the client's bottom-forming conditions E ≥ D/2 and OV = 2E − D > 0 (tolerance 1e-9 mm). Empty = valid.
 * Non-finite input is reported as both issues.
 */
export function validateBottomFlaps(depth: number, allowance: number = getAllowanceForOverlap(depth)): BottomFlapIssue[] {
  if (!Number.isFinite(depth) || !Number.isFinite(allowance)) return ['ALLOWANCE_BELOW_HALF_DEPTH', 'NO_FLAP_OVERLAP'];
  const { overlap, apexDepth } = getBottomFlapGeometry(depth, allowance);
  const issues: BottomFlapIssue[] = [];
  if (allowance < apexDepth - 1e-9) issues.push('ALLOWANCE_BELOW_HALF_DEPTH');
  if (overlap <= 1e-9) issues.push('NO_FLAP_OVERLAP');
  return issues;
}

/**
 * Soft dimension warnings of the block bottom (docs/PRODUCTION.md §3.4.1, §10.7). BOTTOM_TRAPEZOID_DEGENERATE: W < 2E =
 * D + 30 — the 45° creases of the FRONT / BACK bottom zones meet before the zone end, so the trapezoid becomes a
 * triangle and the side flaps overlap. The geometry degrades gracefully (no NaN); the client has not decided yet
 * whether this becomes a hard limit, so it is a warning only.
 */
export type DimensionWarning = 'BOTTOM_TRAPEZOID_DEGENERATE';

/** Smallest width with a proper bottom trapezoid: 2E = D + 30 mm. */
export function getMinTrapezoidWidth(depth: number): number {
  return 2 * getAllowanceForOverlap(depth);
}

export function getDimensionWarnings(dimensions: Pick<Dimensions, 'width' | 'depth'>): DimensionWarning[] {
  const { width, depth } = dimensions;
  if (!Number.isFinite(width) || !Number.isFinite(depth) || width <= 0 || depth <= 0) return [];
  return isBottomTrapezoidDegenerate(dimensions) ? ['BOTTOM_TRAPEZOID_DEGENERATE'] : [];
}
