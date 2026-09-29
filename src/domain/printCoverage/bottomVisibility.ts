// Which printed parts of a wall's bottom zone show on the finished bag (docs/SPEC.md §4d/§4f, docs/PRODUCTION.md §4.1).
// Pure TS. Ink coverage counts everything printed on the sheet (the whole zone when the placement is extended to the
// bottom); these helpers tell which of it is visible from below on the formed bottom (client model [K]): the BACK
// trapezoid, the part of the FRONT trapezoid the BACK one leaves free, and the LEFT / RIGHT side triangles. The corner
// triangles of FRONT / BACK and the rest of the side flaps are hidden inside the bottom.

import { getVisibleBottomZoneParts, pointInConvexPolygon } from '../geometry/blockBottom';
import { polygonArea } from '../geometry/sideGusset';
import { getBottomAllowance } from '../geometry/tube';
import { getPanelSize } from '../panels';
import type { Dimensions, PanelPosition } from '../types';

/** Panel-local point (y ∈ [−E, 0] = bottom zone) visible from below on the formed bag (boundaries inclusive). */
export function isBottomZonePointVisible(panel: PanelPosition, point: { x: number; y: number }, dimensions: Dimensions): boolean {
  if (point.y > 1e-9) return false;
  return getVisibleBottomZoneParts(panel, dimensions).some((part) => pointInConvexPolygon(point, part, 1e-9));
}

/** Area of the wall's bottom zone visible from below, mm², and its share of the whole zone (0–1). */
export function getVisibleBottomZoneArea(panel: PanelPosition, dimensions: Dimensions): { area: number; share: number } {
  const area = getVisibleBottomZoneParts(panel, dimensions).reduce((sum, part) => sum + Math.abs(polygonArea(part)), 0);
  const zone = getPanelSize(panel, dimensions).width * getBottomAllowance(dimensions);
  return { area, share: zone > 0 ? area / zone : 0 };
}
