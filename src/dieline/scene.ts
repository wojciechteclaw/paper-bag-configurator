// Adapter: domain Dieline (+ artwork placements) → SVG-space primitives (mm, y down).
// Shared by the interactive DielineView and the SVG/PDF export so all three draw exactly the same thing.

import { computePanelUvTransform, getPanelArtworkArea, uvTransformToPanelMatrix, type Affine2 } from '../domain/artworkPlacement';
import { getArtworkClipRect } from '../domain/dieline';
import type { Dieline, DielineDimensionKey, DielineLabelKey, DielineSegmentId, DielineZoneKind, Point2 } from '../domain/dieline';
import { getPanelSize } from '../domain/panels';
import type { BagPanels, PanelPosition } from '../domain/types';

export type SceneLine = { id: string; code: string; x1: number; y1: number; x2: number; y2: number };
export type SceneRect = { id: string; x: number; y: number; width: number; height: number };
export type SceneZone = SceneRect & { kind: DielineZoneKind };
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

export const SCENE_MARGIN = { left: 34, top: 34, right: 8, bottom: 8 } as const;

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
    return { id: line.id, code: line.code, x1, y1, x2, y2 };
  });
  const zones = dieline.zones
    .filter((zone) => zone.kind !== 'BOTTOM_ALLOWANCE')
    .map((zone) => ({ ...svgRect(zone.id, zone.rect), kind: zone.kind }));
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
  const labels = dieline.labels.map((label) => {
    const [x, y] = pt(label.at);
    const glue = label.key === 'glueFlap';
    return { id: label.id, x, y, text: texts.label(label.key), size: fmt(label.size), ...(glue ? { rotate: -90 } : {}) };
  });

  const dimensions = dieline.annotations.map((dimension): SceneDimension => {
    const [fx, fy] = pt(dimension.from);
    const [tx, ty] = pt(dimension.to);
    const text = texts.dimension(dimension.key, dimension.value);
    if (dimension.side === 'top') {
      const y = fy - dimension.offset;
      return {
        id: dimension.id,
        key: dimension.key,
        line: { x1: fx, y1: y, x2: tx, y2: y },
        extensions: [fx, tx].map((x) => ({ x1: x, y1: fy - 1, x2: x, y2: y - 2 })),
        text: { id: `${dimension.id}-text`, x: fmt((fx + tx) / 2), y: fmt(y - 1.5), text, size: 3.5 },
      };
    }
    const x = fx - dimension.offset;
    return {
      id: dimension.id,
      key: dimension.key,
      line: { x1: x, y1: fy, x2: x, y2: ty },
      extensions: [fy, ty].map((y) => ({ x1: fx - 1, y1: y, x2: x - 2, y2: y })),
      text: { id: `${dimension.id}-text`, x: fmt(x - 1.5), y: fmt((fy + ty) / 2), text, size: 3.5, rotate: -90 },
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
  cut: { stroke: '#111111', width: 0.4 },
  crease: { stroke: '#0a6cc2', width: 0.3, dash: '3 2' },
  patch: { stroke: '#c2410c', width: 0.3, dash: '1.2 1.2' },
  safety: { stroke: '#15803d', width: 0.25, dash: '0.8 1.2' },
  bleed: { stroke: '#dc2626', width: 0.25 },
  allowanceFill: 'rgba(120, 120, 120, 0.10)',
  /** Outline of an allowance that carries artwork (extended to the bottom). */
  allowancePrinted: { stroke: '#7c3aed', width: 0.5, dash: '2 1' },
  bottomGlueFill: 'rgba(234, 179, 8, 0.18)',
  glueFlapFill: 'rgba(234, 179, 8, 0.28)',
  dimension: { stroke: '#444444', width: 0.2 },
  text: '#222222',
  sheetFill: '#ffffff',
} as const;
