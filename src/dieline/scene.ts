// Adapter: domain Dieline (+ artwork placements) → SVG-space primitives (mm, y down).
// Shared by the interactive DielineView and the SVG/PDF export so all three draw exactly the same thing.

import { computePanelUvTransform, getPanelArtworkArea, uvTransformToPanelMatrix, type Affine2 } from '../domain/artworkPlacement';
import { getArtworkClipRect } from '../domain/dieline';
import type {
  CreaseFold,
  Dieline,
  DielineDimensionKey,
  DielineLabelKey,
  DielineSegmentId,
  DielineZoneKind,
  Point2,
} from '../domain/dieline';
import { getPanelSize } from '../domain/panels';
import type { BagPanels, PanelPosition } from '../domain/types';

/** A crease line; `kind` = fold direction seen from the print side (valley / mountain, docs/PRODUCTION.md §9.3). */
export type SceneLine = { id: string; code: string; kind: CreaseFold; x1: number; y1: number; x2: number; y2: number };
export type SceneRect = { id: string; x: number; y: number; width: number; height: number };
/**
 * A zone. `points` (SVG polygon points) when it is not a rectangle (the chamfered glue flap); `face` for glue zones:
 * PRINT = glue on the printed side, REVERSE = glue on the inside face (drawn as an outline only).
 */
export type SceneZone = SceneRect & { kind: DielineZoneKind; points?: string; face?: 'PRINT' | 'REVERSE' };
export type SceneText = { id: string; x: number; y: number; text: string; size: number; rotate?: number };
export type SceneDimension = {
  id: string;
  key: DielineDimensionKey;
  /** Dimension line. */
  line: { x1: number; y1: number; x2: number; y2: number };
  /** Extension lines from the measured edge to just past the dimension line. */
  extensions: { x1: number; y1: number; x2: number; y2: number }[];
  text: SceneText;
};
/**
 * Bottom allowance of one column (below the bottom line). `printed` = the panel has artwork extended to the bottom
 * (SPEC §4f): its colours land on the bottom flaps / ears / tucks; otherwise the allowance stays bare paper.
 */
export type SceneAllowance = SceneRect & { panel: PanelPosition; segment: DielineSegmentId; printed: boolean };
export type SceneImage = {
  id: string;
  panel: PanelPosition;
  segment: DielineSegmentId;
  href: string;
  /** Maps the unit square (SVG `<image x=0 y=0 width=1 height=1 preserveAspectRatio="none">`) into the sheet. */
  matrix: Affine2;
  clip: SceneRect;
  /** Artwork area of the panel (wall, or wall + bottom allowance when extended), SVG space. */
  area: SceneRect;
  extendToBottom: boolean;
  /** Image outline (4 corners, SVG space) — selection frame and handles. */
  corners: [number, number][];
};

export type DielineScene = {
  sheet: { width: number; height: number };
  /** Drawing extent including dimension annotations: [minX, minY, width, height]. */
  viewBox: [number, number, number, number];
  cuts: string[];
  creases: SceneLine[];
  /** Zones except the bottom allowance, which is drawn per column (`allowances`). */
  zones: SceneZone[];
  allowances: SceneAllowance[];
  patches: SceneRect[];
  labels: SceneText[];
  dimensions: SceneDimension[];
  images: SceneImage[];
  /** Sheet x of each column, for pointer → panel conversion. */
  segments: { id: DielineSegmentId; panel: PanelPosition; x0: number; x1: number; localX0: number }[];
  bottomLineY: number;
};

export type SceneTexts = {
  label: (key: DielineLabelKey) => string;
  dimension: (key: DielineDimensionKey, value: number) => string;
};

/** Dimension text height, mm on the sheet — 5× the original 3.5 mm (client: dimensions were too small to read). */
export const DIMENSION_TEXT_SIZE = 17.5;

/**
 * Dimension tiers outside the sheet: the domain's offsets (10 = inner tier, 22 = outer tier for the sheet totals) are
 * re-spaced so each tier clears the enlarged text: line at DIMENSION_GAP + tier · DIMENSION_TIER_SPACING from the sheet.
 */
export const DIMENSION_GAP = 6;
export const DIMENSION_TIER_SPACING = DIMENSION_TEXT_SIZE + 8;
/** Approximate glyph metrics of the dimension font, used to keep texts inside the sheet extent. */
const CAP_HEIGHT_RATIO = 0.75;
const CHAR_WIDTH_RATIO = 0.56;
const TEXT_BASELINE_GAP = 2;
const OUTER_TEXT_REACH =
  DIMENSION_GAP + DIMENSION_TIER_SPACING + TEXT_BASELINE_GAP + DIMENSION_TEXT_SIZE * CAP_HEIGHT_RATIO;

// Left/top margins fit both dimension tiers and their text.
export const SCENE_MARGIN = { left: Math.ceil(OUTER_TEXT_REACH + 4), top: Math.ceil(OUTER_TEXT_REACH + 4), right: 8, bottom: 8 } as const;

const dimensionTier = (domainOffset: number) => (domainOffset > 10 ? 1 : 0);
const estimateTextLength = (text: string) => text.length * DIMENSION_TEXT_SIZE * CHAR_WIDTH_RATIO;
/** Centre of a text of length `length` near `mid`, shifted so it stays within [min, max] when it is too long. */
const fitCentre = (mid: number, length: number, min: number, max: number) =>
  length >= max - min ? (min + max) / 2 : Math.min(max - length / 2, Math.max(min + length / 2, mid));

const PANEL_LABEL_KEYS: ReadonlySet<string> = new Set(['FRONT', 'BACK', 'LEFT', 'RIGHT']);

const fmt = (value: number) => Math.round(value * 1000) / 1000;

export function buildDielineScene(dieline: Dieline, panels: BagPanels, texts: SceneTexts): DielineScene {
  const H = dieline.sheet.height;
  const pt = (point: Point2): [number, number] => [fmt(point.x), fmt(H - point.y)];
  const svgRect = (id: string, r: { x: number; y: number; width: number; height: number }): SceneRect => ({
    id,
    x: fmt(r.x),
    y: fmt(H - r.y - r.height),
    width: fmt(r.width),
    height: fmt(r.height),
  });

  const cuts = dieline.cuts.map((polygon) => `M${polygon.map((point) => pt(point).join(' ')).join(' L')} Z`);
  const creases = dieline.creases.map((line) => {
    const [x1, y1] = pt(line.from);
    const [x2, y2] = pt(line.to);
    return { id: line.id, code: line.code, kind: line.kind, x1, y1, x2, y2 };
  });
  const zones = dieline.zones
    .filter((zone) => zone.kind !== 'BOTTOM_ALLOWANCE')
    .map((zone): SceneZone => ({
      ...svgRect(zone.id, zone.rect),
      kind: zone.kind,
      ...(zone.polygon ? { points: zone.polygon.map((point) => pt(point).join(',')).join(' ') } : {}),
      ...(zone.face ? { face: zone.face } : {}),
    }));
  const allowances = dieline.segments.map((segment): SceneAllowance => {
    const { artwork, placement } = panels[segment.panel];
    return {
      ...svgRect(`allowance-${segment.id}`, segment.allowance),
      panel: segment.panel,
      segment: segment.id,
      printed: artwork !== null && placement.extendToBottom,
    };
  });
  const patches = dieline.handlePatches.map((patch) => svgRect(patch.id, patch.rect));
  // Only panel names are drawn; zone descriptions (allowance, flaps, glue flap) were removed at the client's request.
  const labels = dieline.labels.filter((label) => PANEL_LABEL_KEYS.has(label.key)).map((label) => {
    const [x, y] = pt(label.at);
    const glue = label.key === 'glueFlap';
    return { id: label.id, x, y, text: texts.label(label.key), size: fmt(label.size), ...(glue ? { rotate: -90 } : {}) };
  });

  const dimensions = dieline.annotations.map((dimension): SceneDimension => {
    const [fx, fy] = pt(dimension.from);
    const [tx, ty] = pt(dimension.to);
    const text = texts.dimension(dimension.key, dimension.value);
    const offset = DIMENSION_GAP + dimensionTier(dimension.offset) * DIMENSION_TIER_SPACING;
    const length = estimateTextLength(text);
    if (dimension.side === 'top') {
      const y = fy - offset;
      const cx = fitCentre((fx + tx) / 2, length, 0, dieline.sheet.width);
      return {
        id: dimension.id,
        key: dimension.key,
        line: { x1: fx, y1: y, x2: tx, y2: y },
        extensions: [fx, tx].map((x) => ({ x1: x, y1: fy - 1, x2: x, y2: y - 2 })),
        text: { id: `${dimension.id}-text`, x: fmt(cx), y: fmt(y - TEXT_BASELINE_GAP), text, size: DIMENSION_TEXT_SIZE },
      };
    }
    const x = fx - offset;
    const cy = fitCentre((fy + ty) / 2, length, 0, dieline.sheet.height);
    return {
      id: dimension.id,
      key: dimension.key,
      line: { x1: x, y1: fy, x2: x, y2: ty },
      extensions: [fy, ty].map((y) => ({ x1: fx - 1, y1: y, x2: x - 2, y2: y })),
      text: { id: `${dimension.id}-text`, x: fmt(x - TEXT_BASELINE_GAP), y: fmt(cy), text, size: DIMENSION_TEXT_SIZE, rotate: -90 },
    };
  });

  const images: SceneImage[] = [];
  for (const segment of dieline.segments) {
    const panel = panels[segment.panel];
    const artwork = panel.artwork;
    if (!artwork || segment.x1 - segment.x0 <= 0) continue;
    const panelSize = getPanelSize(segment.panel, dieline.dimensions);
    // The artwork area (wall, or wall + bottom allowance with extendToBottom) drives both the mapping and the clip.
    const area = getPanelArtworkArea(segment.panel, dieline.dimensions, panel.placement);
    const uv = computePanelUvTransform(panelSize, artwork, panel.placement, area);
    const p = uvTransformToPanelMatrix(panelSize, uv);
    // texture t = (ix, 1 − iy) for image unit-square point (ix, iy); sheet = panel + shift; SVG y = H − sheet y.
    const shiftX = segment.x0 - segment.localX0;
    const shiftY = dieline.bottomLineY;
    const matrix: Affine2 = {
      a: fmt(p.a),
      b: fmt(-p.b),
      c: fmt(-p.c),
      d: fmt(p.d),
      e: fmt(p.c + p.e + shiftX),
      f: fmt(H - p.d - p.f - shiftY),
    };
    const corners = ([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ] as const).map(([ix, iy]): [number, number] => [
      fmt(matrix.a * ix + matrix.c * iy + matrix.e),
      fmt(matrix.b * ix + matrix.d * iy + matrix.f),
    ]);
    images.push({
      id: `artwork-${segment.id}`,
      panel: segment.panel,
      segment: segment.id,
      href: artwork.fileUrl,
      matrix,
      clip: svgRect(`clip-${segment.id}`, getArtworkClipRect(dieline, segment, panel.placement.extendToBottom)),
      area: svgRect(`area-${segment.id}`, { ...area, x: area.x + shiftX, y: area.y + shiftY }),
      extendToBottom: panel.placement.extendToBottom,
      corners,
    });
  }

  return {
    sheet: { ...dieline.sheet },
    viewBox: [
      -SCENE_MARGIN.left,
      -SCENE_MARGIN.top,
      fmt(dieline.sheet.width + SCENE_MARGIN.left + SCENE_MARGIN.right),
      fmt(dieline.sheet.height + SCENE_MARGIN.top + SCENE_MARGIN.bottom),
    ],
    cuts,
    creases,
    zones,
    allowances,
    patches,
    labels,
    dimensions,
    images,
    segments: dieline.segments.map(({ id, panel, x0, x1, localX0 }) => ({ id, panel, x0, x1, localX0 })),
    bottomLineY: dieline.bottomLineY,
  };
}

export const matrixAttr = (m: Affine2) => `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`;

/** Drawing style shared by the view and the export (stroke widths in mm). */
export const DIELINE_STYLE = {
  /** Cut line: red stroke (client spec, layer `cut`). */
  cut: { stroke: '#e1001a', width: 0.4 },
  /** Valley crease (layer `crease_valley`): blue dashed. Also the generic crease sample of the product sheet legend. */
  crease: { stroke: '#0a6cc2', width: 0.3, dash: '3 2' },
  /** Mountain crease (layer `crease_mountain`): teal dash-dot. */
  creaseMountain: { stroke: '#0f766e', width: 0.3, dash: '4 1.2 0.6 1.2' },
  patch: { stroke: '#c2410c', width: 0.3, dash: '1.2 1.2' },
  safety: { stroke: '#15803d', width: 0.25, dash: '0.8 1.2' },
  bleed: { stroke: '#ec4899', width: 0.25 },
  allowanceFill: 'rgba(120, 120, 120, 0.10)',
  /** Outline of an allowance that carries artwork (extended to the bottom). */
  allowancePrinted: { stroke: '#7c3aed', width: 0.5, dash: '2 1' },
  bottomGlueFill: 'rgba(234, 179, 8, 0.18)',
  /** Glue band on the inside face (BACK flap, back on top): outline only. */
  bottomGlueReverse: { stroke: '#b45309', width: 0.3, dash: '1 1' },
  glueFlapFill: 'rgba(234, 179, 8, 0.28)',
  dimension: { stroke: '#444444', width: 0.2 },
  text: '#222222',
  sheetFill: '#ffffff',
} as const;
