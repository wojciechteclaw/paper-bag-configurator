// How a bag's size is written in file names. Pure TS.
import type { BagConfiguration } from './types';

/**
 * Size part of file names, as the size is written for the bag type: `200x400x150` (W × H × D) for the block bottom,
 * `140+90x370` (W + F × H, client notation [K], docs/PRODUCTION.md §13.1) for the gusseted bag.
 */
export function getDimensionsSlug(configuration: Pick<BagConfiguration, 'productType' | 'dimensions'>): string {
  const { width, height, depth } = configuration.dimensions;
  return configuration.productType === 'FOLDED' ? `${width}+${depth}x${height}` : `${width}x${height}x${depth}`;
}
