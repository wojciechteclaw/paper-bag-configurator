// Bottom allowance an artwork can extend over ("Rozciągnij na dno", docs/SPEC.md §4f), per bag type. Pure TS.
//
// Block bottom: the bottom zone below every wall, a = (D + 30) / 2 (`getBottomAllowance`). Gusseted bag (FOLDED,
// client [K] 30.09.2026): the bottom strip d below the bottom fold line (configured `bottomFoldDepth`, capped at H / 2)
// — it folds to the BACK, so its print shows on the back of the flat bag and under the open bag. The allowance is
// always panel-local y ∈ [−a, 0] below the bottom line, the same coordinates for both types.

import { getConfiguredBottomFold } from './bottomFold';
import { getBottomFoldDepth } from './geometry/gussetedBag';
import { getBottomAllowance } from './geometry/tube';
import type { BagConfiguration, Dimensions } from './types';

/** What the allowance depends on: dimensions, bag type and the gusseted bag's bottom strip (missing type = block). */
export type AllowanceGeometry = Pick<BagConfiguration, 'dimensions'> &
  Partial<Pick<BagConfiguration, 'productType' | 'bottomFoldDepth'>>;

/** Bare dimensions (block bottom) or the bag geometry. */
export type AllowanceSource = Dimensions | AllowanceGeometry;

const geometryOf = (source: AllowanceSource): AllowanceGeometry => ('dimensions' in source ? source : { dimensions: source });

/** Dimensions of an allowance source. */
export function getSourceDimensions(source: AllowanceSource): Dimensions {
  return geometryOf(source).dimensions;
}

/** Bottom allowance below every wall, mm: block a = (D + 30) / 2, gusseted the strip d. */
export function getArtworkBottomAllowance(source: AllowanceSource): number {
  const geometry = geometryOf(source);
  if (geometry.productType === 'FOLDED') {
    return getBottomFoldDepth({ height: geometry.dimensions.height, bottomFold: getConfiguredBottomFold(geometry) });
  }
  return getBottomAllowance(geometry.dimensions);
}
