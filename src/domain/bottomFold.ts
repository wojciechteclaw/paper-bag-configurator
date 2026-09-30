// Configured bottom strip d of the gusseted bag's fold-over bottom. Pure TS.

import { BAG_TYPES } from './config/productCatalog';
import type { BagConfiguration, BagType } from './types';

/** The bag's bottom strip d, mm, or undefined for bag types without one (block bottom); older data → the default. */
export function getConfiguredBottomFold(
  configuration: Partial<Pick<BagConfiguration, 'bottomFoldDepth' | 'productType'>>,
): number | undefined {
  const range = BAG_TYPES[configuration.productType ?? 'BLOCK'].bottomFold;
  if (!range) return undefined;
  const d = configuration.bottomFoldDepth;
  return typeof d === 'number' && Number.isFinite(d) ? d : range.default;
}

/** `value` rounded to whole mm and clamped into the bag type's range; NaN or no range keeps `current`. */
export function constrainBottomFold(value: number, productType: BagType, current: number | undefined): number | undefined {
  const range = BAG_TYPES[productType].bottomFold;
  if (!range) return undefined;
  if (!Number.isFinite(value)) return current ?? range.default;
  return Math.min(range.max, Math.max(range.min, Math.round(value)));
}
