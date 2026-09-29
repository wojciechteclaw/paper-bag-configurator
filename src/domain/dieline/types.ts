// Dieline (wykrój) data model — pure data, millimetres. See docs/PRODUCTION.md §9 and docs/SPEC.md §4b.
//
// Sheet coordinates: origin at the BOTTOM-LEFT corner of the cut sheet (the tube end), x to the right, y up,
// printed side (outside of the bag) facing the viewer. The bottom line (C1) is at y = `bottomLineY` = allowance a,
// so PRODUCTION.md's Y maps to sheet y = Y + a.

import type { Point2, Polygon2 } from '../geometry/sideGusset';
import type { Dimensions, PanelPosition } from '../types';

export type { Point2, Polygon2 };

export type Rect = { x: number; y: number; width: number; height: number };

/**
 * Sheet columns from the left: LEFT | FRONT | RIGHT | BACK | glue flap (PRODUCTION.md §9.1). The seam lies on the
 * BACK/LEFT tube edge: the glue flap hinges on BACK's outer edge and is glued to LEFT's free edge (sheet x = 0).
 */
export type DielineSegmentId = 'LEFT' | 'FRONT' | 'RIGHT' | 'BACK';

export type DielineSegment = {
  id: DielineSegmentId;
  panel: PanelPosition;
  /** Sheet x range of the column. */
  x0: number;
  x1: number;
  /** Panel-local x (seen from outside) at sheet x0; the column shows panel x ∈ [localX0, localX0 + (x1 − x0)]. */
  localX0: number;
  /** Visible wall part of the column (above the bottom line). */
  wall: Rect;
  /** Bottom allowance below the wall (forms the block bottom). */
  allowance: Rect;
};

/** Crease codes of PRODUCTION.md §9.3. */
export type CreaseCode = 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7' | 'C8';

export type DielineLine = { id: string; code: CreaseCode; from: Point2; to: Point2 };

export type DielineZoneKind =
  | 'BLEED'
  | 'SAFETY'
  | 'BOTTOM_ALLOWANCE'
  | 'BOTTOM_FLAP_GLUE'
  | 'GLUE_FLAP';

export type DielineZone = { id: string; kind: DielineZoneKind; rect: Rect };

export type DielineHandlePatch = { id: string; panel: 'FRONT' | 'BACK'; segment: DielineSegmentId; rect: Rect };

export type DielineDimensionKey = 'width' | 'depth' | 'height' | 'allowance' | 'glueFlap' | 'sheetWidth' | 'sheetHeight';

/**
 * A dimension line. `from`/`to` lie on the measured edge; the line is drawn `offset` mm outside the sheet on `side`.
 */
export type DielineDimension = {
  id: string;
  key: DielineDimensionKey;
  from: Point2;
  to: Point2;
  value: number;
  side: 'top' | 'left';
  offset: number;
};

export type DielineLabelKey =
  | 'FRONT'
  | 'BACK'
  | 'LEFT'
  | 'RIGHT'
  | 'glueFlap'
  | 'frontFlap'
  | 'backFlap'
  | 'sideFlap';

export type DielineLabel = { id: string; key: DielineLabelKey; at: Point2; /** Font size hint, mm. */ size: number };

export type Dieline = {
  dimensions: Dimensions;
  /** Bottom allowance a = (D + 30) / 2. */
  allowance: number;
  glueFlapWidth: number;
  /** Seam position on BACK, panel-local x: always W, i.e. the BACK/LEFT tube edge (client rule, §9.1). */
  seamOffset: number;
  sheet: { width: number; height: number };
  bottomLineY: number;
  segments: DielineSegment[];
  glueFlap: Rect;
  /** Closed cut contours (the sheet outline). */
  cuts: Polygon2[];
  creases: DielineLine[];
  zones: DielineZone[];
  handlePatches: DielineHandlePatch[];
  annotations: DielineDimension[];
  labels: DielineLabel[];
};
