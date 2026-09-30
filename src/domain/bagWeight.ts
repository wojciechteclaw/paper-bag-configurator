// Paper weight of one bag without handles: blank (cut outline of the dieline) × grammage. Pure TS.

import { buildDieline } from './dieline';
import { polygonArea } from './geometry/sideGusset';
import type { BagConfiguration } from './types';

export type BagWeight = {
  /** Area of the cut blank (outline incl. glue flap and bottom allowance), m². */
  blankAreaM2: number;
  /** Paper mass of the blank, g — no handles, patches or glue. */
  grams: number;
};

const MM2_PER_M2 = 1_000_000;

/**
 * Weight of the bag's paper without handles (handle loops and patches are separate parts, glue is ignored). The blank
 * is the one of the bag type (`productType`; missing = block bottom) with the bag's glue flap: the gusseted bag's blank
 * is B × L = (2W + 2F + s) × (H + d).
 */
export function getBagWeight(
  configuration: Pick<BagConfiguration, 'dimensions' | 'paper'> & Partial<Pick<BagConfiguration, 'glueFlapWidth' | 'productType'>>,
): BagWeight {
  const dieline = buildDieline({
    dimensions: configuration.dimensions,
    handle: null,
    glueFlapWidth: configuration.glueFlapWidth,
    productType: configuration.productType,
  });
  const blankAreaM2 = dieline.cuts.reduce((sum, polygon) => sum + Math.abs(polygonArea(polygon)), 0) / MM2_PER_M2;
  return { blankAreaM2, grams: blankAreaM2 * configuration.paper.grammage };
}
