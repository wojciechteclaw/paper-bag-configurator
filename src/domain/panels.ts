import { ARTWORK_RULES } from './config/productCatalog';
import type { Dimensions, PanelPosition } from './types';

export type Size = { width: number; height: number };

/** Flat size of a bag wall in mm: FRONT/BACK = width × height, LEFT/RIGHT = depth × height. */
export function getPanelSize(position: PanelPosition, dimensions: Dimensions): Size {
  const width = position === 'FRONT' || position === 'BACK' ? dimensions.width : dimensions.depth;
  return { width, height: dimensions.height };
}

/** width / height; NaN for degenerate sizes. */
export function getAspectRatio(size: Size): number {
  return size.width > 0 && size.height > 0 ? size.width / size.height : Number.NaN;
}

/**
 * True when an image mapped with FILL onto the panel would be visibly distorted,
 * i.e. the aspect ratios differ by more than `tolerance` (relative).
 */
export function hasAspectRatioMismatch(
  image: Size,
  panel: Size,
  tolerance: number = ARTWORK_RULES.aspectRatioTolerance,
): boolean {
  const imageRatio = getAspectRatio(image);
  const panelRatio = getAspectRatio(panel);
  if (!Number.isFinite(imageRatio) || !Number.isFinite(panelRatio)) return false;
  return Math.abs(imageRatio / panelRatio - 1) > tolerance;
}
