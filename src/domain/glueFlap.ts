// Width of the longitudinal glue flap (seam overlap) of a bag. Pure TS.

import { BAG_TYPES } from './config/productCatalog';
import type { BagConfiguration, BagType } from './types';

/** The bag's glue flap width, mm; data saved before the field existed gets its bag type's default. */
export function getGlueFlapWidth(configuration: Partial<Pick<BagConfiguration, 'glueFlapWidth' | 'productType'>>): number {
  const { glueFlapWidth, productType } = configuration;
  return typeof glueFlapWidth === 'number' && Number.isFinite(glueFlapWidth)
    ? glueFlapWidth
    : BAG_TYPES[productType ?? 'BLOCK'].glueFlap.default;
}

/** `value` rounded to whole mm and clamped into the bag type's range; NaN keeps `current`. */
export function constrainGlueFlapWidth(value: number, productType: BagType, current: number): number {
  if (!Number.isFinite(value)) return current;
  const { min, max } = BAG_TYPES[productType].glueFlap;
  return Math.min(max, Math.max(min, Math.round(value)));
}
