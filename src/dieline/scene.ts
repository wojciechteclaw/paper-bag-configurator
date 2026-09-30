// Adapter: domain Dieline (+ artwork placements) → SVG-space primitives (mm, y down).
// Shared by the interactive DielineView and the SVG/PDF export so all three draw exactly the same thing.

import { getWrapLayerId, type ResolvedPanelArtworks } from '../domain/artworkLayout';
import { computePanelUvTransform, uvTransformToPanelMatrix, type Affine2 } from '../domain/artworkPlacement';
import { DIELINE_RULES } from '../domain/config/productionRules';
import { getArtworkClipHoles, getArtworkClipRect } from '../domain/dieline';
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
import type { ArtworkTarget, PanelPosition } from '../domain/types';

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
  /** Wall of the column; for a whole-bag layer the first wall of the merged part (FRONT, or LEFT for the LEFT part). */
  panel: PanelPosition;
  /** What editing this image changes: its wall, or one whole-bag layer (`WRAP:<id>`). */
  target: ArtworkTarget;
  /** Sheet column, or `'WRAP'` for a merged part of a whole-bag layer (FRONT…BACK, or the LEFT column). */
  segment: DielineSegmentId | 'WRAP';
  href: string;
  /** Maps the unit square (SVG `<image x=0 y=0 width=1 height=1 preserveAspectRatio="none">`) into the sheet. */
  matrix: Affine2;
  clip: SceneRect;
  /**
   * Parts of `clip` left unprinted because the paper is cut away there (window openings, docs/SPEC.md §2b), SVG space.
   * Drawn as an even-odd clip path (`clipPathData`).
   */
  clipHoles?: SceneRect[];
  /** Artwork area (wall, or wall + bottom allowance when extended; the whole wall row for the wrap), SVG space. */
  area: SceneRect;
  extendToBottom: boolean;
  /** Image outline (4 corners, SVG space) — selection frame and handles. */
  corners: [number, number][];
  /** Position of the layer in its stack (0 = bottom), for drawing order. */
  stackIndex?: number;
};

/** A film window (docs/SPEC.md §2b): the opening cut from the paper and the film glued on the inside, SVG space. */
export type SceneWindow = { id: string; opening: SceneRect; film: SceneRect; openAtTop: boolean; filmOverlap: number };

export type DielineScene = {
  sheet: { width: number; height: number };
  /** Film windows (gusseted bag); their zones are also in `zones` (WINDOW_OPENING, WINDOW_FILM). */
  windows: SceneWindow[];
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

/**
 * `artworks` = what every wall shows (`resolvePanelArtworks`): per-wall artwork, or the whole-bag layers expressed per
 * wall (docs/SPEC.md §3a, §3b). A whole-bag layer yields one image per column with the same sheet matrix, merged into
 * one image per layer (`mergeWrapImages`). Images are listed bottom → top (drawing order).
 */
export function buildDielineScene(dieline: Dieline, artworks: ResolvedPanelArtworks, texts: SceneTexts): DielineScene {
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
  const allowances = dieline.segments.map((segment): SceneAllowance => ({
    ...svgRect(`allowance-${segment.id}`, segment.allowance),
    panel: segment.panel,
    segment: segment.id,
    printed: artworks[segment.panel].extendsToBottom,
  }));
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

  const columnImages: SceneImage[] = [];
  for (const segment of dieline.segments) {
    if (segment.x1 - segment.x0 <= 0) continue;
    const panelSize = getPanelSize(segment.panel, dieline.dimensions);
    // Layers bottom → top: later images are drawn over earlier ones. A whole-bag layer may have two entries on a wall
    // (two copies of the cyclic wrap).
    for (const { artwork, placement, area, target, clipX, stackIndex } of artworks[segment.panel].layers) {
      // The artwork area (wall, or wall + bottom allowance with extendToBottom; for a whole-bag layer the wrap area in
      // this panel's coordinates, shifted to this copy) drives the mapping; the clip stays per column.
      const uv = computePanelUvTransform(panelSize, artwork, placement, area);
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
      // Column clip (wall + crease overprint / bleed, down to the bottom line or the allowance), limited to this copy's
      // extent for a whole-bag layer (widened by the crease overprint, like a column edge, so neighbouring copies
      // overlap slightly instead of leaving a hairline gap at the fold).
      const columnClip = getArtworkClipRect(dieline, segment, placement.extendToBottom);
      const overprint = DIELINE_RULES.creaseOverprint;
      const clipX0 = clipX ? Math.max(columnClip.x, clipX.x0 + shiftX - overprint) : columnClip.x;
      const clipX1 = clipX
        ? Math.min(columnClip.x + columnClip.width, clipX.x1 + shiftX + overprint)
        : columnClip.x + columnClip.width;
      if (clipX1 <= clipX0) continue;
      const clipRect = { ...columnClip, x: clipX0, width: clipX1 - clipX0 };
      const clip = svgRect(`clip-${segment.id}`, clipRect);
      // Window openings: the paper is cut away, nothing is printed there (docs/SPEC.md §2b).
      const clipHoles = getArtworkClipHoles(dieline, segment, placement.extendToBottom)
        .map((hole) => intersectRect(hole, clipRect))
        .filter((hole): hole is NonNullable<typeof hole> => hole !== null)
        .map((hole, i) => svgRect(`hole-${segment.id}-${i + 1}`, hole));
      // A copy that does not reach this column is left out: nothing to draw, edit or embed.
      if (!overlaps(corners, clip)) continue;
      // Artwork area shown when selected: the wall (and allowance); a whole-bag layer's area is widened to the whole
      // wall row when merged (the wrap is cyclic, it covers every wall).
      const areaX0 = Math.max(area.x + shiftX, segment.x0);
      const areaX1 = Math.min(area.x + area.width + shiftX, segment.x1);
      columnImages.push({
        id: `artwork-${segment.id}`,
        panel: segment.panel,
        target,
        segment: segment.id,
        href: artwork.fileUrl,
        matrix,
        clip,
        ...(clipHoles.length > 0 ? { clipHoles } : {}),
        area: svgRect(`area-${segment.id}`, { x: areaX0, y: area.y + shiftY, width: Math.max(0, areaX1 - areaX0), height: area.height }),
        extendToBottom: placement.extendToBottom,
        corners,
        ...(stackIndex !== undefined ? { stackIndex } : {}),
      });
    }
  }
  const wallColumns = dieline.segments.filter((segment) => segment.x1 - segment.x0 > 0);
  const images = mergeWrapImages(columnImages, {
    x0: Math.min(...wallColumns.map((segment) => segment.x0)),
    x1: Math.max(...wallColumns.map((segment) => segment.x1)),
  });

  const windows = (dieline.windows ?? []).map((window): SceneWindow => ({
    id: window.id,
    opening: svgRect(`${window.id}-opening`, window.opening),
    film: svgRect(`${window.id}-film`, window.film),
    openAtTop: window.openAtTop,
    filmOverlap: window.filmOverlap,
  }));

  return {
    sheet: { ...dieline.sheet },
    windows,
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

type PlainRect = { x: number; y: number; width: number; height: number };

function intersectRect(a: PlainRect, b: PlainRect): PlainRect | null {
  const x0 = Math.max(a.x, b.x);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y0 = Math.max(a.y, b.y);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
}

/**
 * SVG path of an image's clip: its rectangle, minus the holes (use with `clip-rule="evenodd"`). Holes lie inside the
 * rectangle and do not overlap, so even-odd filling cuts them out exactly.
 */
export function clipPathData(image: Pick<SceneImage, 'clip' | 'clipHoles'>): string {
  const box = ({ x, y, width, height }: PlainRect) =>
    `M${fmt(x)} ${fmt(y)} H${fmt(x + width)} V${fmt(y + height)} H${fmt(x)} Z`;
  return [image.clip, ...(image.clipHoles ?? [])].map(box).join(' ');
}

/**
 * True when SVG point `[px, py]` lies on the visible part of `image`: inside its clip and its outline (a
 * parallelogram — the point is on the same side of every edge). Lets the dieline editor keep dragging the selected
 * layer where it is covered by another one.
 */
export function isPointOnSceneImage(image: Pick<SceneImage, 'clip' | 'corners' | 'clipHoles'>, [px, py]: [number, number]): boolean {
  const { clip, corners } = image;
  if (px < clip.x || px > clip.x + clip.width || py < clip.y || py > clip.y + clip.height) return false;
  if (image.clipHoles?.some((h) => px > h.x && px < h.x + h.width && py > h.y && py < h.y + h.height)) return false;
  let sign = 0;
  for (let i = 0; i < corners.length; i++) {
    const [ax, ay] = corners[i];
    const [bx, by] = corners[(i + 1) % corners.length];
    const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    if (cross === 0) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

/** True when the image outline's bounding box overlaps the clip rectangle (90° rotations: the box is exact). */
function overlaps(corners: [number, number][], clip: SceneRect): boolean {
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  return (
    Math.max(...xs) > clip.x &&
    Math.min(...xs) < clip.x + clip.width &&
    Math.max(...ys) > clip.y &&
    Math.min(...ys) < clip.y + clip.height
  );
}

/**
 * Merges the column images of each whole-bag layer. The wrap is cyclic and starts at LEFT's free edge, in the sheet
 * order of the columns LEFT | FRONT | RIGHT | BACK, so a copy lies 1:1 on the columns: columns whose copies sit at the
 * same sheet position share one matrix and their clips are adjacent (each overlaps its neighbour by the crease
 * overprint) with equal vertical extent, so their union is one rectangle. Typically:
 * - one image over all the columns it reaches (`artwork-WRAP-<id>` when it includes FRONT);
 * - an image crossing the BACK | LEFT seam (the wrap ends) is split between the sheet ends: the part at the BACK end and
 *   the part at the LEFT start are the same image shifted by the wrap width → `artwork-WRAP-<id>-BACK` / `-LEFT`;
 * - other groups → `artwork-WRAP-<id>-<first wall>`.
 * All images of a layer are edited as one (same target) and keep the layer order (bottom → top), after wall images.
 * `row` = sheet x extent of the wall columns: the selection area of a whole-bag layer (it covers every wall).
 */
function mergeWrapImages(images: SceneImage[], row: { x0: number; x1: number }): SceneImage[] {
  const groups = new Map<string, { layerId: string; images: SceneImage[] }>();
  for (const image of images) {
    const layerId = getWrapLayerId(image.target);
    if (layerId === null) continue;
    const key = `${layerId}|${matrixAttr(image.matrix)}`;
    const group = groups.get(key);
    if (group) group.images.push(image);
    else groups.set(key, { layerId, images: [image] });
  }
  if (groups.size === 0) return images;
  const merged: SceneImage[] = [];
  const used = new Set<string>();
  for (const { layerId, images: group } of groups.values()) {
    const first = group[0];
    const base = group.some((image) => image.panel === 'FRONT') ? '' : `-${first.panel}`;
    let suffix = base;
    for (let n = 2; used.has(`${layerId}${suffix}`); n++) suffix = `${base}-${n}`;
    used.add(`${layerId}${suffix}`);
    const minX = Math.min(...group.map((image) => image.clip.x));
    const maxX = Math.max(...group.map((image) => image.clip.x + image.clip.width));
    const clipHoles = group.flatMap((image) => image.clipHoles ?? []);
    merged.push({
      ...first,
      ...(clipHoles.length > 0 ? { clipHoles } : {}),
      id: `artwork-WRAP-${layerId}${suffix}`,
      segment: 'WRAP',
      clip: { ...first.clip, id: `clip-WRAP-${layerId}${suffix}`, x: fmt(minX), width: fmt(maxX - minX) },
      area: { ...first.area, id: `area-WRAP-${layerId}${suffix}`, x: fmt(row.x0), width: fmt(row.x1 - row.x0) },
    });
  }
  // Groups were created column by column (LEFT first), so restore the layer order (stable sort).
  merged.sort((a, b) => (a.stackIndex ?? 0) - (b.stackIndex ?? 0));
  return [...images.filter((image) => getWrapLayerId(image.target) === null), ...merged];
}

export const matrixAttr =(m: Affine2) => `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`;

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
  /** Window opening (no paper): a light film tint; film glued on the inside: dashed outline (docs/SPEC.md §2b). */
  windowOpeningFill: 'rgba(56, 189, 248, 0.16)',
  windowFilm: { stroke: '#0284c7', width: 0.35, dash: '2.5 1.2' },
  dimension: { stroke: '#444444', width: 0.2 },
  text: '#222222',
  sheetFill: '#ffffff',
} as const;
