// Artwork layout (docs/SPEC.md §3a, §3b): one artwork per wall, or whole-bag artwork made of ordered LAYERS. Pure TS.
//
// Every consumer (3D renderer, 2D dieline, ink coverage, exports) reads artwork per wall through
// `resolvePanelArtwork(s)`: the LAYERS a wall shows, bottom → top, each with its artwork, placement and the ARTWORK
// AREA that placement refers to, in that wall's panel-local mm. Per wall there is at most one layer (the wall's own
// artwork); in the WRAP layout every whole-bag layer is expressed per wall as the whole wrap area shifted left by
// the wall's position around the bag. Panel-local x of every wall runs left → right seen from outside, so each layer
// lands contiguously on LEFT | FRONT | RIGHT | BACK — in 3D (incl. the bottom pieces, which live in the UV space of
// their wall), on the dieline and in the coverage sampling — through the existing
// `computePanelUvTransform(panelSize, image, placement, area)` without any consumer knowing about the wrap.
//
// Wrap coordinates (client decision [K] 30.09.2026, "tak jak wykrój" — like the dieline): x starts at the LEFT
// wall's free edge (the seam) and runs in sheet order — LEFT [0, D], FRONT [D, D + W], RIGHT [D + W, 2D + W], BACK
// [2D + W, 2W + 2D] — ending at the BACK/LEFT seam (the glue-flap hinge); y from the bottom line (y = 0) up to the top
// edge (y = H); with `extendToBottom` a layer's area also covers the bottom allowance, y ∈ [−a, H], exactly like a
// single wall (§4f). Each layer has its own placement and its own "extend to bottom". On the sheet (columns LEFT |
// FRONT | RIGHT | BACK | glue flap) the wrap lies 1:1 on the wall columns; the glue flap is never printed [K].
//
// The wrap is CYCLIC (client bug report 30.09.2026: an image must move naturally across every corner): the
// image of a layer repeats at x + k·P (P = 2W + 2D), each copy limited to one period around the image centre
// (`getWrapImageExtent`). The wrap area is only the reference for FILL / fit / align / centring and the vertical clip;
// horizontally a copy is clipped to the wall and its `clipX`. `offsetX` wraps into one period (`periodicX`) instead
// of being clamped, so dragging across either end is continuous.
//
// Whole-sheet layers (SHEET, docs/SPEC.md §3c) are placed 1:1 on the flat dieline sheet like a print file: area = the
// whole sheet in sheet coordinates (no wrap, no cycle); each wall shows the part in its sheet column, its bottom
// allowance / strip always included; the glue-flap column is never printed.

import { getArtworkRect, getPanelArtworkArea, normalizePlacement, type PanelArtworkArea, type Size2 } from './artworkPlacement';
import { ARTWORK_RULES, DEFAULT_ARTWORK_LAYOUT, MAX_WRAP_ARTWORK_LAYERS } from './config/productCatalog';
import { buildDieline } from './dieline/buildDieline';
import type { Dieline } from './dieline/types';
import { getBottomAllowance } from './geometry/tube';
import { getPanelSize } from './panels';
import type {
  Artwork,
  ArtworkLayer,
  ArtworkLayout,
  ArtworkPlacement,
  ArtworkTarget,
  BagConfiguration,
  Dimensions,
  LayeredArtworkLayout,
  LegacyWrapArtwork,
  PanelPosition,
  SheetLayerTarget,
  WrapArtworkLayer,
  WrapLayerTarget,
} from './types';

/** Walls in the order the whole-bag artwork runs around the bag: sheet order from LEFT's free edge (client decision [K]). */
export const WRAP_PANEL_ORDER: readonly PanelPosition[] = ['LEFT', 'FRONT', 'RIGHT', 'BACK'];

/** Walls in the sheet order of the dieline columns (§4b) — the listing order of per-wall artwork. */
export const SHEET_PANEL_ORDER: readonly PanelPosition[] = ['LEFT', 'FRONT', 'RIGHT', 'BACK'];

/**
 * The configuration fields artwork resolution needs; the layout fields may be missing in older data, which may also
 * carry the single pre-layer `wrapArtwork` slot (migrated by `getWrapLayers`).
 */
export type ArtworkSource = Pick<BagConfiguration, 'dimensions' | 'panels'> &
  Partial<Pick<BagConfiguration, 'artworkLayout' | 'wrapLayers' | 'sheetLayers' | 'productType' | 'glueFlapWidth' | 'bottomFoldDepth'>> & {
    wrapArtwork?: LegacyWrapArtwork | null;
  };

/**
 * What the sheet geometry depends on (whole-sheet layers, docs/SPEC.md §3c): dimensions, bag type, glue flap width and
 * the gusseted bag's bottom strip (missing type = block bottom; missing values = the type's defaults).
 */
export type ArtworkGeometry = Pick<BagConfiguration, 'dimensions'> &
  Partial<Pick<BagConfiguration, 'productType' | 'glueFlapWidth' | 'bottomFoldDepth'>>;

/** One artwork layer of a wall as every consumer should see it. */
export type ResolvedArtworkLayer = {
  /** What editing this layer changes: the wall itself, or one whole-bag layer (`WRAP:<id>`). */
  target: ArtworkTarget;
  artwork: Artwork;
  placement: ArtworkPlacement;
  /**
   * Artwork area of the placement in this wall's panel-local mm (may extend beyond the wall, e.g. for a wrap). It is
   * the reference for FILL / scale / offsets and clips the image VERTICALLY; horizontally the image is clipped to the
   * wall (sheet column) and to `clipX`.
   */
  area: PanelArtworkArea;
  /**
   * Whole-bag layers only: horizontal extent of this copy of the cyclic wrap (panel-local mm) — the image clipped to
   * one wrap period around its centre, so neighbouring copies (x ± P) never overlap. Absent: the wall clips alone.
   */
  clipX?: { x0: number; x1: number };
  /** Position of the layer in its stack (0 = bottom); a whole-bag layer keeps it on every wall and copy. */
  stackIndex?: number;
};

/** Artwork of one wall: its layers, bottom → top (empty = bare paper). */
export type ResolvedPanelArtwork = {
  position: PanelPosition;
  layers: ResolvedArtworkLayer[];
  /** True when any layer extends to the bottom (its colours reach the bottom flaps / ears / tucks, §4f). */
  extendsToBottom: boolean;
};

export type ResolvedPanelArtworks = Record<PanelPosition, ResolvedPanelArtwork>;

const WRAP_TARGET_PREFIX = 'WRAP:';
/** Copies of the cyclic wrap that can reach a wall (the image centre lies within one period). */
const WRAP_COPIES = [-1, 0, 1] as const;
/** Overlaps thinner than this (mm) do not count as "visible on the wall". */
const WRAP_EPSILON = 1e-6;
const NO_LAYERS: readonly WrapArtworkLayer[] = Object.freeze([]);
const EMPTY_SLOT = Object.freeze({ artwork: null, placement: Object.freeze({ mode: 'FILL', extendToBottom: false }) }) as {
  artwork: Artwork | null;
  placement: ArtworkPlacement;
};

/** Active layout; older data without the field is per wall. */
export function getArtworkLayout(configuration: Partial<Pick<BagConfiguration, 'artworkLayout'>>): ArtworkLayout {
  const layout = configuration.artworkLayout;
  return layout === 'WRAP' || layout === 'PER_PANEL' || layout === 'SHEET' ? layout : DEFAULT_ARTWORK_LAYOUT;
}

/** Layouts made of ordered layers: whole bag (WRAP) and whole sheet (SHEET). */
export const LAYERED_ARTWORK_LAYOUTS: readonly LayeredArtworkLayout[] = ['WRAP', 'SHEET'];

export function isLayeredLayout(layout: ArtworkLayout): layout is LayeredArtworkLayout {
  return layout === 'WRAP' || layout === 'SHEET';
}

/** Artwork target of layer `layerId` of a layered layout: `WRAP:<id>` or `SHEET:<id>`. */
export function layerTarget(layout: LayeredArtworkLayout, layerId: string): WrapLayerTarget | SheetLayerTarget {
  return `${layout}:${layerId}`;
}

/** Layout and layer id of a layer target; null for a wall. */
export function getLayerTargetInfo(
  target: string | null | undefined,
): { layout: LayeredArtworkLayout; layerId: string } | null {
  if (typeof target !== 'string') return null;
  for (const layout of LAYERED_ARTWORK_LAYOUTS) {
    if (target.startsWith(`${layout}:`)) return { layout, layerId: target.slice(layout.length + 1) };
  }
  return null;
}

/** Whole-sheet layers, bottom → top (the stored list itself; none in older data). */
export function getSheetLayers(configuration: Partial<Pick<BagConfiguration, 'sheetLayers'>>): readonly ArtworkLayer[] {
  return Array.isArray(configuration.sheetLayers) ? configuration.sheetLayers : NO_LAYERS;
}

/** Layers of a layered layout (whole bag: migrates the legacy single slot, `getWrapLayers`). */
export function getLayers(
  configuration: Partial<Pick<BagConfiguration, 'wrapLayers' | 'sheetLayers'>> & { wrapArtwork?: LegacyWrapArtwork | null },
  layout: LayeredArtworkLayout,
): readonly ArtworkLayer[] {
  return layout === 'SHEET' ? getSheetLayers(configuration) : getWrapLayers(configuration);
}

// ——— Layer targets ———

/** Artwork target of the whole-bag layer `layerId`. */
export function wrapLayerTarget(layerId: string): WrapLayerTarget {
  return `${WRAP_TARGET_PREFIX}${layerId}`;
}

export function isWrapLayerTarget(target: string | null | undefined): target is WrapLayerTarget {
  return typeof target === 'string' && target.startsWith(WRAP_TARGET_PREFIX);
}

/** Layer id of a whole-bag layer target; null for a wall. */
export function getWrapLayerId(target: ArtworkTarget): string | null {
  return isWrapLayerTarget(target) ? target.slice(WRAP_TARGET_PREFIX.length) : null;
}

// ——— Layers and migration of older data ———

/** Stable id of the layer migrated from a pre-layer `wrapArtwork` (derived from the artwork id: same data → same id). */
export const legacyWrapLayerId = (artwork: Artwork) => `wrap-${artwork.id}`;

const migrated = new WeakMap<object, readonly WrapArtworkLayer[]>();

/**
 * The single pre-layer whole-bag slot as a layer list: one layer with its artwork and placement (a missing
 * `extendToBottom` read as false, like `normalizePlacement`), or none when the slot held no artwork.
 */
export function migrateLegacyWrapArtwork(legacy: LegacyWrapArtwork | null | undefined): WrapArtworkLayer[] {
  if (!legacy?.artwork) return [];
  const placement: ArtworkPlacement = legacy.placement
    ? { ...legacy.placement, extendToBottom: legacy.placement.extendToBottom === true }
    : { mode: 'FILL', extendToBottom: false };
  return [{ id: legacyWrapLayerId(legacy.artwork), artwork: legacy.artwork, placement }];
}

/**
 * Whole-bag layers, bottom → top. Returns the stored list itself (stable reference, safe in store selectors); older
 * data without `wrapLayers` is migrated from its single `wrapArtwork` slot (memoised per slot object).
 */
export function getWrapLayers(
  configuration: Partial<Pick<BagConfiguration, 'wrapLayers'>> & { wrapArtwork?: LegacyWrapArtwork | null },
): readonly WrapArtworkLayer[] {
  if (Array.isArray(configuration.wrapLayers)) return configuration.wrapLayers;
  const legacy = configuration.wrapArtwork;
  if (!legacy?.artwork) return NO_LAYERS;
  let layers = migrated.get(legacy);
  if (!layers) {
    layers = migrateLegacyWrapArtwork(legacy);
    migrated.set(legacy, layers);
  }
  return layers;
}

/**
 * A configuration in the current shape: `wrapLayers` present (migrated from a legacy `wrapArtwork`, capped at
 * `MAX_WRAP_ARTWORK_LAYERS`) and the legacy field dropped. For loading saved / serialized configurations.
 */
export function withWrapLayers<T extends Partial<Pick<BagConfiguration, 'wrapLayers'>> & { wrapArtwork?: LegacyWrapArtwork | null }>(
  configuration: T,
): Omit<T, 'wrapArtwork' | 'wrapLayers'> & { wrapLayers: WrapArtworkLayer[] } {
  const { wrapArtwork: _legacy, wrapLayers: _layers, ...rest } = configuration;
  return { ...rest, wrapLayers: getWrapLayers(configuration).slice(0, MAX_WRAP_ARTWORK_LAYERS) };
}

export function getWrapLayer(
  configuration: Parameters<typeof getWrapLayers>[0],
  layerId: string,
): WrapArtworkLayer | undefined {
  return getWrapLayers(configuration).find((layer) => layer.id === layerId);
}

// ——— Geometry ———

/** x of the wall's left edge (seen from outside) in wrap coordinates: LEFT 0, FRONT D, RIGHT D + W, BACK 2D + W. */
export function getWrapPanelOffset(position: PanelPosition, dimensions: Dimensions): number {
  let offset = 0;
  for (const wall of WRAP_PANEL_ORDER) {
    if (wall === position) return offset;
    offset += getPanelSize(wall, dimensions).width;
  }
  return offset;
}

/** Visible size of the four walls around the bag: (2W + 2D) × H. */
export function getWrapSize(dimensions: Dimensions): Size2 {
  return { width: 2 * dimensions.width + 2 * dimensions.depth, height: dimensions.height };
}

/** Artwork area of a wrap layer in wrap coordinates: (2W + 2D) × H, or × (H + a) from y = −a with `extendToBottom`. */
export function getWrapArtworkArea(
  dimensions: Dimensions,
  placement: Pick<ArtworkPlacement, 'extendToBottom'>,
): PanelArtworkArea {
  const { width, height } = getWrapSize(dimensions);
  if (!placement.extendToBottom) return { x: 0, y: 0, width, height, periodicX: true };
  const a = getBottomAllowance(dimensions);
  return { x: 0, y: -a, width, height: height + a, periodicX: true };
}

/**
 * Horizontal extent of a whole-bag layer's image in wrap coordinates, limited to ONE period (2W + 2D) around the
 * image centre: the cyclic wrap repeats it at x ± P, and an image wider than the bag must not overlap itself. FILL
 * covers exactly [0, P].
 */
export function getWrapImageExtent(
  dimensions: Dimensions,
  image: Size2,
  placement: ArtworkPlacement,
): { x0: number; x1: number } {
  const area = getWrapArtworkArea(dimensions, placement);
  const period = area.width;
  const rect = getArtworkRect(area, image, placement, area);
  const half = (rect.rotation === 90 || rect.rotation === 270 ? rect.height : rect.width) / 2;
  const reach = Math.min(half, period / 2);
  return { x0: rect.center.x - reach, x1: rect.center.x + reach };
}

/** Visible size an artwork target is printed on: the wall, or the whole wall row for a whole-bag layer. */
export function getArtworkTargetSize(target: ArtworkTarget, source: Dimensions | ArtworkGeometry): Size2 {
  const layout = getLayerTargetInfo(target)?.layout;
  if (layout === 'SHEET') return getSheetDieline(source).sheet;
  const { dimensions } = geometryOf(source);
  return layout === 'WRAP' ? getWrapSize(dimensions) : getPanelSize(target as PanelPosition, dimensions);
}

const geometryOf = (source: Dimensions | ArtworkGeometry): ArtworkGeometry =>
  'dimensions' in source ? source : { dimensions: source };

let lastSheet: { key: string; dieline: Dieline } | null = null;

/**
 * The dieline the whole-sheet layers are laid on (`buildDieline`; the handle does not change the sheet). Memoised for
 * the last geometry: editors ask for it on every pointer move.
 */
export function getSheetDieline(source: Dimensions | ArtworkGeometry): Dieline {
  const { dimensions, productType, glueFlapWidth, bottomFoldDepth } = geometryOf(source);
  const key = [productType ?? 'BLOCK', dimensions.width, dimensions.height, dimensions.depth, glueFlapWidth, bottomFoldDepth].join('|');
  if (lastSheet?.key !== key) {
    lastSheet = { key, dieline: buildDieline({ dimensions, handle: null, productType, glueFlapWidth, bottomFoldDepth }) };
  }
  return lastSheet.dieline;
}

/**
 * Artwork area of a whole-sheet layer: the whole cut sheet, sheet coordinates (x from its left edge, y from its bottom
 * edge — the tube end), bottom allowance / strip and glue-flap column included, so FILL maps a print file 1:1.
 */
export function getSheetArtworkArea(source: Dimensions | ArtworkGeometry): PanelArtworkArea {
  const { sheet } = getSheetDieline(source);
  return { x: 0, y: 0, width: sheet.width, height: sheet.height };
}

/**
 * Artwork area a target's placement refers to, in the target's own coordinates (panel-local mm for a wall, wrap
 * coordinates for a whole-bag layer, sheet coordinates for a whole-sheet layer). Only the size matters to the placement
 * editing helpers (offsets are centre-relative). Pass the configuration (or `ArtworkGeometry`) for whole-sheet layers;
 * bare dimensions assume a block-bottom sheet.
 */
export function getArtworkTargetArea(
  target: ArtworkTarget,
  source: Dimensions | ArtworkGeometry,
  placement: Pick<ArtworkPlacement, 'extendToBottom'>,
): PanelArtworkArea {
  const { dimensions } = geometryOf(source);
  const layout = getLayerTargetInfo(target)?.layout;
  if (layout === 'SHEET') return getSheetArtworkArea(source);
  return layout === 'WRAP'
    ? getWrapArtworkArea(dimensions, placement)
    : getPanelArtworkArea(target as PanelPosition, dimensions, placement);
}

/** Aspect-kept placement fitting `image` inside `rect` (contain) and centred on it; `area` = the placement's area. */
function fitIntoRect(
  area: PanelArtworkArea,
  rect: { x: number; y: number; width: number; height: number },
  image: Size2,
  extendToBottom: boolean,
): ArtworkPlacement {
  const containRect = Math.min(rect.width / image.width, rect.height / image.height);
  const containArea = Math.min(area.width / image.width, area.height / image.height);
  return normalizePlacement(
    {
      mode: 'CUSTOM',
      offsetX: rect.x + rect.width / 2 - (area.x + area.width / 2),
      offsetY: rect.y + rect.height / 2 - (area.y + area.height / 2),
      scale: containRect / containArea,
      rotation: 0,
      extendToBottom,
    },
    area,
  );
}

/**
 * Placement of a print file on the whole sheet (docs/SPEC.md §3c): FILL when the image has the sheet's proportions (a
 * whole-sheet file, bottom allowance / strip and glue-flap column included); an image with the proportions of the
 * wall row only (a whole-bag file, (2W + 2D) × H) is laid 1:1 over the wall columns above the bottom line instead of
 * being stretched; anything else FILLs (the UI warns about the proportions).
 */
export function getPrintFilePlacement(geometry: ArtworkGeometry, image: Size2): ArtworkPlacement {
  const fill: ArtworkPlacement = { mode: 'FILL', extendToBottom: true };
  if (!(image.width > 0 && image.height > 0)) return fill;
  const dieline = getSheetDieline(geometry);
  const area = getSheetArtworkArea(geometry);
  const ratio = image.width / image.height;
  const matches = (size: Size2) => Math.abs(ratio - size.width / size.height) / (size.width / size.height) <= ARTWORK_RULES.aspectRatioTolerance;
  if (matches(area)) return fill;
  const walls = dieline.segments.filter((segment) => segment.x1 - segment.x0 > 0);
  const x0 = Math.min(...walls.map((segment) => segment.x0));
  const x1 = Math.max(...walls.map((segment) => segment.x1));
  const row = { x: x0, y: dieline.bottomLineY, width: x1 - x0, height: area.height - dieline.bottomLineY };
  return walls.length > 0 && matches(row) ? fitIntoRect(area, row, image, true) : fill;
}

/**
 * Placement of a new layer of a layered layout. The first layer (a background, or the whole print file on the sheet)
 * FILLs the area; later layers (logo, barcode, …) start fitted inside the FRONT wall and centred on it. Whole-sheet
 * layers always print the bottom allowance (`extendToBottom` true).
 */
export function getNewLayerPlacement(
  layout: LayeredArtworkLayout,
  geometry: ArtworkGeometry,
  image: Size2,
  existingLayers: number,
  extendToBottom: boolean,
): ArtworkPlacement {
  if (layout === 'WRAP') return getNewWrapLayerPlacement(geometry.dimensions, image, existingLayers, extendToBottom);
  if (existingLayers === 0 || !(image.width > 0 && image.height > 0)) return { mode: 'FILL', extendToBottom: true };
  const front = getSheetDieline(geometry).segments.find((segment) => segment.panel === 'FRONT');
  const area = getSheetArtworkArea(geometry);
  return front ? fitIntoRect(area, front.wall, image, true) : { mode: 'FILL', extendToBottom: true };
}

/**
 * Placement of a new whole-bag layer. The first layer (typically the background) FILLs the wall row; later layers
 * (logo, barcode, …) start fitted inside the FRONT wall and centred on it (aspect ratio kept), so they neither hide
 * the layers below nor get stretched. `extendToBottom` is the given default.
 */
export function getNewWrapLayerPlacement(
  dimensions: Dimensions,
  image: Size2,
  existingLayers: number,
  extendToBottom: boolean,
): ArtworkPlacement {
  if (existingLayers === 0 || !(image.width > 0 && image.height > 0)) return { mode: 'FILL', extendToBottom };
  const area = getWrapArtworkArea(dimensions, { extendToBottom });
  const wall = getPanelSize('FRONT', dimensions);
  const wallLeft = getWrapPanelOffset('FRONT', dimensions);
  const containWall = Math.min(wall.width / image.width, wall.height / image.height);
  const containArea = Math.min(area.width / image.width, area.height / image.height);
  return normalizePlacement(
    {
      mode: 'CUSTOM',
      offsetX: wallLeft + wall.width / 2 - (area.x + area.width / 2),
      offsetY: wall.height / 2 - (area.y + area.height / 2),
      scale: containWall / containArea,
      rotation: 0,
      extendToBottom,
    },
    area,
  );
}

// ——— Slots, targets, resolution ———

/** The stored artwork + placement of a target (whether or not its layout is active); empty for an unknown layer. */
export function getArtworkSlot(
  configuration: ArtworkSource,
  target: ArtworkTarget,
): { artwork: Artwork | null; placement: ArtworkPlacement } {
  const info = getLayerTargetInfo(target);
  if (info !== null) return getLayers(configuration, info.layout).find((layer) => layer.id === info.layerId) ?? EMPTY_SLOT;
  const { artwork, placement } = configuration.panels[target as PanelPosition];
  return { artwork, placement };
}

/** Targets of the active layout: the four walls, or the layers (whole bag / whole sheet) bottom → top. */
export function getActiveArtworkTargets(
  configuration: Partial<Pick<BagConfiguration, 'artworkLayout' | 'wrapLayers' | 'sheetLayers'>> & {
    wrapArtwork?: LegacyWrapArtwork | null;
  },
): ArtworkTarget[] {
  const layout = getArtworkLayout(configuration);
  return isLayeredLayout(layout)
    ? getLayers(configuration, layout).map((layer) => layerTarget(layout, layer.id))
    : [...SHEET_PANEL_ORDER];
}

/** True when the active layout carries at least one artwork (inactive, kept artwork does not count). */
export function hasActiveArtwork(configuration: ArtworkSource): boolean {
  return getActiveArtworkTargets(configuration).some((target) => getArtworkSlot(configuration, target).artwork !== null);
}

/** What wall `position` shows under the active layout (see the file comment). */
export function resolvePanelArtwork(configuration: ArtworkSource, position: PanelPosition): ResolvedPanelArtwork {
  const { dimensions } = configuration;
  let layers: ResolvedArtworkLayer[];
  const layout = getArtworkLayout(configuration);
  if (layout === 'SHEET') {
    // Whole-sheet layers (docs/SPEC.md §3c): the sheet is the print file, so the wall shows the part of the sheet in its
    // column — panel-local = sheet shifted by the column's position and the bottom line. The area is the whole sheet
    // (placement reference and vertical clip: the column's allowance / strip is always printed); horizontally the wall
    // (sheet column) clips as for any wall artwork, so the glue-flap column — no wall's column — is never printed.
    const dieline = getSheetDieline(configuration);
    const sheetArea = getSheetArtworkArea(configuration);
    layers = [];
    for (const segment of dieline.segments) {
      if (segment.panel !== position || segment.x1 - segment.x0 <= 0) continue;
      const shiftX = segment.x0 - segment.localX0;
      getSheetLayers(configuration).forEach(({ id, artwork, placement }, stackIndex) => {
        const rect = getArtworkRect(sheetArea, artwork, placement, sheetArea);
        const half = (rect.rotation === 90 || rect.rotation === 270 ? rect.height : rect.width) / 2;
        if (Math.min(rect.center.x + half, segment.x1) - Math.max(rect.center.x - half, segment.x0) <= WRAP_EPSILON) return;
        layers.push({
          target: layerTarget('SHEET', id),
          artwork,
          placement: placement.extendToBottom ? placement : { ...placement, extendToBottom: true },
          area: { ...sheetArea, x: sheetArea.x - shiftX, y: sheetArea.y - dieline.bottomLineY },
          stackIndex,
        });
      });
    }
  } else if (layout === 'WRAP') {
    // The wrap is cyclic with period P = 2W + 2D (it runs around the bag): a layer's image shows at x + k·P. Every
    // copy that reaches this wall becomes an entry (usually one; two when the image crosses the wrap ends — the
    // BACK | LEFT seam — or when it is wider than the wall's neighbours allow).
    const wallX0 = getWrapPanelOffset(position, dimensions);
    const wallX1 = wallX0 + getPanelSize(position, dimensions).width;
    layers = [];
    getWrapLayers(configuration).forEach(({ id, artwork, placement }, stackIndex) => {
      const area = getWrapArtworkArea(dimensions, placement);
      const extent = getWrapImageExtent(dimensions, artwork, placement);
      for (const k of WRAP_COPIES) {
        const x0 = extent.x0 + k * area.width;
        const x1 = extent.x1 + k * area.width;
        if (Math.min(x1, wallX1) - Math.max(x0, wallX0) <= WRAP_EPSILON) continue;
        const shift = k * area.width - wallX0;
        layers.push({
          target: wrapLayerTarget(id),
          artwork,
          placement,
          area: { ...area, x: area.x + shift },
          clipX: { x0: x0 - wallX0, x1: x1 - wallX0 },
          stackIndex,
        });
      }
    });
  } else {
    const { artwork, placement } = configuration.panels[position];
    layers = artwork
      ? [{ target: position, artwork, placement, area: getPanelArtworkArea(position, dimensions, placement), stackIndex: 0 }]
      : [];
  }
  return { position, layers, extendsToBottom: layers.some((layer) => layer.placement.extendToBottom === true) };
}

export function resolvePanelArtworks(configuration: ArtworkSource): ResolvedPanelArtworks {
  return {
    FRONT: resolvePanelArtwork(configuration, 'FRONT'),
    BACK: resolvePanelArtwork(configuration, 'BACK'),
    LEFT: resolvePanelArtwork(configuration, 'LEFT'),
    RIGHT: resolvePanelArtwork(configuration, 'RIGHT'),
  };
}
