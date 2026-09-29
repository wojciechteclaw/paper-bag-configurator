import { DIMENSION_STEP_MM, type DimensionLimits, type Range } from './config/productCatalog';
import type { Dimensions } from './types';

/**
 * Rounds `value` to the nearest multiple of `step` and clamps it into `range`.
 * Range bounds that are not on the step grid are pulled inwards (min rounded up, max rounded down).
 */
export function clampToStep(value: number, range: Range, step: number): number {
  const lo = Math.ceil(range.min / step) * step;
  const hi = Math.floor(range.max / step) * step;
  const snapped = Math.round(value / step) * step;
  return Math.min(hi, Math.max(lo, snapped));
}

/**
 * Catalog limits narrowed by the cross-field rule "depth ≤ width":
 * width can never go below the current depth, depth never above the current width.
 */
export function getEffectiveLimits(dimensions: Dimensions, limits: DimensionLimits): DimensionLimits {
  return {
    width: { min: Math.max(limits.width.min, dimensions.depth), max: limits.width.max },
    height: { ...limits.height },
    depth: { min: limits.depth.min, max: Math.min(limits.depth.max, dimensions.width) },
  };
}

/**
 * Turns any requested value into one that can be stored: clamped into the effective limits
 * (given the other dimensions) and snapped to `DIMENSION_STEP_MM`.
 * Non-finite input keeps the current value.
 */
export function constrainDimension(
  key: keyof Dimensions,
  value: number,
  dimensions: Dimensions,
  limits: DimensionLimits,
): number {
  if (!Number.isFinite(value)) return dimensions[key];
  return clampToStep(value, getEffectiveLimits(dimensions, limits)[key], DIMENSION_STEP_MM);
}

/** Grammage snapped to the catalog step and clamped into its range. Non-finite input keeps `current`. */
export function constrainGrammage(value: number, grammage: Range & { step: number }, current: number): number {
  if (!Number.isFinite(value)) return current;
  return clampToStep(value, grammage, grammage.step);
}

/** Whole pieces, never below the minimum run. Non-finite input keeps `current`. */
export function constrainQuantity(value: number, minQuantity: number, current: number): number {
  if (!Number.isFinite(value)) return current;
  return Math.max(minQuantity, Math.round(value));
}
