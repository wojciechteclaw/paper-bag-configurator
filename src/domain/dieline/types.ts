// Dieline (wykrój) data model — pure data, millimetres. See docs/PRODUCTION.md §9 and docs/SPEC.md §4b.
//
// Sheet coordinates: origin at the BOTTOM-LEFT corner of the cut sheet (the tube end), x to the right, y up,
// printed side (outside of the bag) facing the viewer. The bottom line (C1) is at y = `bottomLineY` = allowance a,
// so PRODUCTION.md's Y maps to sheet y = Y + a.

import type { Point2, Polygon2 } from '../geometry/sideGusset';
import type { Dimensions, PanelPosition, WindowMaterial, WindowType } from '../types';

export type { Point2, Polygon2 };

export type Rect = { x: number; y: number; width: number; height: number };

/**
 * Sheet columns from the left: LEFT | FRONT | RIGHT | BACK | glue flap (PRODUCTION.md §9.1). The seam lies on the
 * BACK/LEFT tube edge: the glue flap hinges on BACK's outer edge and is glued to LEFT's free edge (sheet x = 0). Same
 * order for the gusseted bag (docs/PRODUCTION.md §13.4).
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
  | 'GLUE_FLAP'
  /** Window opening cut from the paper (gusseted bag, docs/PRODUCTION.md §13.6); no print there. */
  | 'WINDOW_OPENING'
  /** Window film glued on the inside (REVERSE face): the opening plus the film overlap. */
  | 'WINDOW_FILM';

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

/**
 * Film window of the FRONT wall (sheet mm). `opening` is cut from the paper (a U notch through the top edge when
 * `openAtTop`, else an inner cut contour); `film` = the film glued on the inside (opening + overlap). `local*` are the
 * same rectangles in the panel-local mm of `panel` (for sampling / masking).
 */
export type DielineWindow = {
  id: string;
  type: WindowType;
  material: WindowMaterial;
  panel: PanelPosition;
  segment: DielineSegmentId;
  openAtTop: boolean;
  filmOverlap: number;
  opening: Rect;
  film: Rect;
  localOpening: Rect;
  localFilm: Rect;
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
   * Seam position on BACK, panel-local x: W, i.e. the BACK/LEFT tube edge, for both bag types (client rules, §9.1 and
   * §13.4 — the gusseted bag uses the block bottom's column order since 30.09.2026).
   */
  seamOffset: number;
  sheet: { width: number; height: number };
  bottomLineY: number;
  segments: DielineSegment[];
  /** Bounding rectangle of the glue flap (the flap itself is chamfered at both ends: zone `glue-flap` polygon). */
  glueFlap: Rect;
  /**
   * Closed cut contours: `cuts[0]` = the outer outline of the blank (with the U notch of a panoramic window), further
   * entries = inner contours cut out of it (a rectangular window opening).
   */
  cuts: Polygon2[];
  /** Film windows (gusseted bag only; empty otherwise). */
  windows: DielineWindow[];
  creases: DielineLine[];
  zones: DielineZone[];
  handlePatches: DielineHandlePatch[];
  annotations: DielineDimension[];
  labels: DielineLabel[];
};
