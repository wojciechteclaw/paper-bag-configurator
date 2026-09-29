import { DIMENSION_STEP_MM, type DimensionLimits } from '../config/productCatalog';
import type { Dimensions } from '../types';

export type DimensionError = 'NOT_A_NUMBER' | 'NOT_POSITIVE' | 'BELOW_MIN' | 'ABOVE_MAX' | 'DEPTH_EXCEEDS_WIDTH' | 'NOT_ON_STEP';

export type DimensionErrors = Partial<Record<keyof Dimensions, DimensionError>>;

export function validateDimension(
  value: number,
  min: number,
  max: number,
  step: number = DIMENSION_STEP_MM,
): DimensionError | null {
  if (!Number.isFinite(value)) return 'NOT_A_NUMBER';
  if (value <= 0) return 'NOT_POSITIVE';
  if (value < min) return 'BELOW_MIN';
  if (value > max) return 'ABOVE_MAX';
  if (value % step !== 0) return 'NOT_ON_STEP';
  return null;
}

export function validateDimensions(dimensions: Dimensions, limits: DimensionLimits): DimensionErrors {
  const errors: DimensionErrors = {};
  for (const key of Object.keys(limits) as (keyof Dimensions)[]) {
    const error = validateDimension(dimensions[key], limits[key].min, limits[key].max);
    if (error) errors[key] = error;
  }
  // Width is always the longer base edge: handles sit on the front/back (width) walls.
  if (!errors.width && !errors.depth && dimensions.depth > dimensions.width) {
    errors.depth = 'DEPTH_EXCEEDS_WIDTH';
  }
  return errors;
}

/**
 * Validates a single (possibly draft) value for `key` against the catalog range, the cross-field rule
 * depth ≤ width (evaluated against the other current dimensions) and the step. Used by the form to explain
 * why a typed value cannot be stored as-is.
 */
export function validateDimensionValue(
  key: keyof Dimensions,
  value: number,
  dimensions: Dimensions,
  limits: DimensionLimits,
): DimensionError | null {
  const error = validateDimension(value, limits[key].min, limits[key].max);
  if (error && error !== 'NOT_ON_STEP') return error;
  const next = { ...dimensions, [key]: value };
  if ((key === 'width' || key === 'depth') && next.depth > next.width) return 'DEPTH_EXCEEDS_WIDTH';
  return error;
}
