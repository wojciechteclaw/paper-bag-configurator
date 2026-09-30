// Paper weight of one bag without handles: blank (cut outline of the dieline, minus cut-outs) × grammage. Pure TS.

import { buildDieline } from './dieline';
import { polygonArea } from './geometry/sideGusset';
import type { BagConfiguration } from './types';
import { getWindow, getWindowDimensions, getWindowFilmArea } from './window';

export type BagWeight = {
  /** Area of the cut blank (outline incl. glue flap and bottom allowance, window openings removed), m². */
  blankAreaM2: number;
  /** Paper mass of the blank, g — no handles, patches, window film or glue. */
  grams: number;
  /** Area of the window film (a separate material, not part of `grams`), m²; 0 without a window. */
  windowFilmAreaM2: number;
};

const MM2_PER_M2 = 1_000_000;

/**
 * Weight of the bag's paper without handles (handle loops and patches are separate parts, glue is ignored). The blank
 * is the one of the bag type (`productType`; missing = block bottom) with the bag's glue flap: the gusseted bag's blank
 * is B × L = (2W + 2F + s) × (H + d). A window opening is cut out of the paper (`cuts[0]` is the outer outline, with a
 * panoramic notch; further contours are holes); its film is reported separately and never adds to the paper weight.
 */
export function getBagWeight(
  configuration: Pick<BagConfiguration, 'dimensions' | 'paper'> &
    Partial<Pick<BagConfiguration, 'glueFlapWidth' | 'bottomFoldDepth' | 'productType' | 'window'>>,
): BagWeight {
  const dieline = buildDieline({
    dimensions: configuration.dimensions,
    handle: null,
    glueFlapWidth: configuration.glueFlapWidth,
    productType: configuration.productType,
    bottomFoldDepth: configuration.bottomFoldDepth,
    window: configuration.window,
  });
  const [outline, ...holes] = dieline.cuts;
  const areaMm2 =
    (outline ? Math.abs(polygonArea(outline)) : 0) - holes.reduce((sum, polygon) => sum + Math.abs(polygonArea(polygon)), 0);
  const blankAreaM2 = areaMm2 / MM2_PER_M2;
  const window = dieline.windows.length > 0 ? getWindow(configuration) : null;
  const windowFilmAreaM2 = window ? getWindowFilmArea(window, getWindowDimensions(configuration)) / MM2_PER_M2 : 0;
  return { blankAreaM2, grams: blankAreaM2 * configuration.paper.grammage, windowFilmAreaM2 };
}
