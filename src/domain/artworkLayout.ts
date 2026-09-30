// Artwork layout (docs/SPEC.md §3a, §3b): one artwork per wall, or whole-bag artwork made of ordered LAYERS. Pure TS.
//
// Every consumer (3D renderer, 2D dieline, ink coverage, exports) reads artwork per wall through
// `resolvePanelArtwork(s)`: the LAYERS a wall shows, bottom → top, each with its artwork, placement and the ARTWORK
// AREA that placement refers to, in that wall's panel-local mm. Per wall there is at most one layer (the wall's own
// artwork); in the WRAP layout every whole-bag layer is expressed per wall as the whole wrap area shifted left by
// the wall's position around the bag. Panel-local x of every wall runs left → right seen from outside, so each layer
// lands contiguously on FRONT | RIGHT | BACK | LEFT — in 3D (incl. the bottom pieces, which live in the UV space of
// their wall), on the dieline and in the coverage sampling — through the existing
// `computePanelUvTransform(panelSize, image, placement, area)` without any consumer knowing about the wrap.
//
// Wrap coordinates (client decision [K] 30.09.2026): x starts at the LEFT EDGE OF THE FRONT wall and runs around the
// bag — FRONT [0, W], RIGHT [W, W + D], BACK [W + D, 2W + D], LEFT [2W + D, 2W + 2D] — ending at the same FRONT/LEFT
// corner; y from the bottom line (y = 0) up to the top edge (y = H); with `extendToBottom` a layer's area also covers
// the bottom allowance, y ∈ [−a, H], exactly like a single wall (§4f). Each layer has its own placement and its own
// "extend to bottom". On the sheet (columns LEFT | FRONT | RIGHT | BACK | glue flap) the LEFT column comes first, so it
// shows the END of the image; the glue flap is never printed [K].

import { getPanelArtworkArea, normalizePlacement, type PanelArtworkArea, type Size2 } from './artworkPlacement';
import { DEFAULT_ARTWORK_LAYOUT, MAX_WRAP_ARTWORK_LAYERS } from './config/productCatalog';
import { getBottomAllowance } from './geometry/tube';
import { getPanelSize } from './panels';
import type {
  Artwork,
  ArtworkLayout,
  ArtworkPlacement,
  ArtworkTarget,
  BagConfiguration,
  Dimensions,
  LegacyWrapArtwork,
  PanelPosition,
  WrapArtworkLayer,
  WrapLayerTarget,
} from './types';

/** Walls in the order the whole-bag artwork runs around the bag, from FRONT's left edge (client decision [K]). */
export const WRAP_PANEL_ORDER: readonly PanelPosition[] = ['FRONT', 'RIGHT', 'BACK', 'LEFT'];

/** Walls in the sheet order of the dieline columns (§4b) — the listing order of per-wall artwork. */
export const SHEET_PANEL_ORDER: readonly PanelPosition[] = ['LEFT', 'FRONT', 'RIGHT', 'BACK'];

/**
 * The configuration fields artwork resolution needs; the layout fields may be missing in older data, which may also
 * carry the single pre-layer `wrapArtwork` slot (migrated by `getWrapLayers`).
 */
export type ArtworkSource = Pick<BagConfiguration, 'dimensions' | 'panels'> &
  Partial<Pick<BagConfiguration, 'artworkLayout' | 'wrapLayers'>> & { wrapArtwork?: LegacyWrapArtwork | null };

/** One artwork layer of a wall as every consumer should see it. */
export type ResolvedArtworkLayer = {
  /** What editing this layer changes: the wall itself, or one whole-bag layer (`WRAP:<id>`). */
  target: ArtworkTarget;
  artwork: Artwork;
  placement: ArtworkPlacement;
  /** Artwork area of the placement in this wall's panel-local mm (may extend beyond the wall, e.g. for a wrap). */
  area: PanelArtworkArea;
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
const NO_LAYERS: readonly WrapArtworkLayer[] = Object.freeze([]);
const EMPTY_SLOT = Object.freeze({ artwork: null, placement: Object.freeze({ mode: 'FILL', extendToBottom: false }) }) as {
  artwork: Artwork | null;
  placement: ArtworkPlacement;
};

/** Active layout; older data without the field is per wall. */
export function getArtworkLayout(configuration: Partial<Pick<BagConfiguration, 'artworkLayout'>>): ArtworkLayout {
  return configuration.artworkLayout === 'WRAP' || configuration.artworkLayout === 'PER_PANEL'
    ? configuration.artworkLayout
    : DEFAULT_ARTWORK_LAYOUT;
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

/** x of the wall's left edge (seen from outside) in wrap coordinates: FRONT 0, RIGHT W, BACK W + D, LEFT 2W + D. */
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
  if (!placement.extendToBottom) return { x: 0, y: 0, width, height };
  const a = getBottomAllowance(dimensions);
  return { x: 0, y: -a, width, height: height + a };
}

/** Visible size an artwork target is printed on: the wall, or the whole wall row for a whole-bag layer. */
export function getArtworkTargetSize(target: ArtworkTarget, dimensions: Dimensions): Size2 {
  return isWrapLayerTarget(target) ? getWrapSize(dimensions) : getPanelSize(target, dimensions);
}

/**
 * Artwork area a target's placement refers to, in the target's own coordinates (panel-local mm for a wall, wrap
 * coordinates for a whole-bag layer). Only the size matters to the placement editing helpers (offsets are
 * centre-relative).
 */
export function getArtworkTargetArea(
  target: ArtworkTarget,
  dimensions: Dimensions,
  placement: Pick<ArtworkPlacement, 'extendToBottom'>,
): PanelArtworkArea {
  return isWrapLayerTarget(target)
    ? getWrapArtworkArea(dimensions, placement)
    : getPanelArtworkArea(target, dimensions, placement);
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
  const layerId = getWrapLayerId(target);
  if (layerId !== null) return getWrapLayer(configuration, layerId) ?? EMPTY_SLOT;
  const { artwork, placement } = configuration.panels[target as PanelPosition];
  return { artwork, placement };
}

/** Targets of the active layout: the four walls, or the whole-bag layers bottom → top. */
export function getActiveArtworkTargets(
  configuration: Partial<Pick<BagConfiguration, 'artworkLayout' | 'wrapLayers'>> & { wrapArtwork?: LegacyWrapArtwork | null },
): ArtworkTarget[] {
  return getArtworkLayout(configuration) === 'WRAP'
    ? getWrapLayers(configuration).map((layer) => wrapLayerTarget(layer.id))
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
  if (getArtworkLayout(configuration) === 'WRAP') {
    const shift = getWrapPanelOffset(position, dimensions);
    layers = getWrapLayers(configuration).map(({ id, artwork, placement }) => {
      const area = getWrapArtworkArea(dimensions, placement);
      return { target: wrapLayerTarget(id), artwork, placement, area: { ...area, x: area.x - shift } };
    });
  } else {
    const { artwork, placement } = configuration.panels[position];
    layers = artwork
      ? [{ target: position, artwork, placement, area: getPanelArtworkArea(position, dimensions, placement) }]
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
