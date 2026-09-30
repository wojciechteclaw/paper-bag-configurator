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
export type DielineSegmentId =
  | 'LEFT'
  | 'FRONT'
  | 'RIGHT'
  | 'BACK'
  /**
   * Gusseted bag (seam in the middle of BACK [K], docs/PRODUCTION.md §13.4): BACK is split into two sheet columns —
   * its half next to LEFT (panel x ∈ [W/2, W]) starts the sheet, its half next to RIGHT (x ∈ [0, W/2]) ends it.
   */
  | 'BACK_LEFT_HALF'
  | 'BACK_RIGHT_HALF';

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
export type CreaseCode = 'C1' | 'C2' | 'C3' | 'C4' | 'C6' | 'C8' | 'C9';

/**
 * Fold direction of a crease seen from the PRINT side, client convention [K] (docs/PRODUCTION.md §9.3):
 * VALLEY = the print side ends up on the OUTSIDE of the fold (tube edges, bottom line), MOUNTAIN = the print side
 * ends up INSIDE the fold, facing itself (gusset centre axis, flat-fold 45° diagonals).
 */
export type CreaseFold = 'VALLEY' | 'MOUNTAIN';

export type DielineLine = { id: string; code: CreaseCode; kind: CreaseFold; from: Point2; to: Point2 };

export type DielineZoneKind =
  | 'BLEED'
  | 'SAFETY'
  | 'BOTTOM_ALLOWANCE'
  | 'BOTTOM_FLAP_GLUE'
  | 'GLUE_FLAP';

/**
 * A zone on the sheet. `face` (glue zones only): the side of the sheet the glue is applied to — PRINT (seen on the
 * dieline) or REVERSE (the inside face; drawn as a counterpart outline). Defaults to PRINT.
 */
export type DielineZone = {
  id: string;
  kind: DielineZoneKind;
  /** Bounding rectangle (the zone itself unless `polygon` is set). */
  rect: Rect;
  /** Exact outline when the zone is not a rectangle (the glue flap with its 45° chamfered ends). */
  polygon?: Polygon2;
  face?: 'PRINT' | 'REVERSE';
};

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
  /**
   * Seam position on BACK, panel-local x: W for the block bottom, i.e. the BACK/LEFT tube edge (client rule, §9.1);
   * W / 2 for the gusseted-bag bag (middle of BACK, client rule, §13.4).
   */
  seamOffset: number;
  sheet: { width: number; height: number };
  bottomLineY: number;
  segments: DielineSegment[];
  /** Bounding rectangle of the glue flap (the flap itself is chamfered at both ends: zone `glue-flap` polygon). */
  glueFlap: Rect;
  /** Closed cut contours (the sheet outline). */
  cuts: Polygon2[];
  creases: DielineLine[];
  zones: DielineZone[];
  handlePatches: DielineHandlePatch[];
  annotations: DielineDimension[];
  labels: DielineLabel[];
};
