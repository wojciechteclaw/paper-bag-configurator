// Tube (the four walls before the bottom is formed) — production geometry in mm. Pure TS.
//
// Every wall panel (FRONT, BACK, LEFT, RIGHT) uses panel-local coordinates seen from outside with the origin at the
// bottom-left corner of the VISIBLE wall (the bottom fold line is y = 0). Below it, the wall extends by the bottom
// allowance, so the full cut panel spans y ∈ [-allowance, height]. The allowance strip forms the block bottom
// (folding details: docs/PRODUCTION.md); the 3D preview does not render it yet.

import { BOTTOM_ALLOWANCE_EXTRA_MM } from '../config/productionRules';
import { getPanelSize } from '../panels';
import type { Dimensions, PanelPosition } from '../types';
import type { Polygon2 } from './sideGusset';

/** Paper below the bottom fold line on every wall: (depth + 30 mm) / 2. */
export function getBottomAllowance({ depth }: Pick<Dimensions, 'depth'>): number {
  return (depth + BOTTOM_ALLOWANCE_EXTRA_MM) / 2;
}

/** Cut length of the tube (height of every wall panel including the bottom allowance): height + allowance. */
export function getTubeCutLength(dimensions: Pick<Dimensions, 'depth' | 'height'>): number {
  return dimensions.height + getBottomAllowance(dimensions);
}

export type PanelBounds = { minX: number; maxX: number; minY: number; maxY: number };

/**
 * Extent of a wall panel in panel-local mm, including the bottom allowance: x ∈ [0, panelWidth],
 * y ∈ [-allowance, height]. The visible wall is the part y ≥ 0.
 */
export function getWallPanelBounds(position: PanelPosition, dimensions: Dimensions): PanelBounds {
  const { width, height } = getPanelSize(position, dimensions);
  return { minX: 0, maxX: width, minY: -getBottomAllowance(dimensions), maxY: height };
}

/** The allowance strip below the bottom fold line as a CCW polygon (panel-local mm). */
export function getBottomAllowanceStrip(position: PanelPosition, dimensions: Dimensions): Polygon2 {
  const { minX, maxX, minY } = getWallPanelBounds(position, dimensions);
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: 0 },
    { x: minX, y: 0 },
  ];
}
