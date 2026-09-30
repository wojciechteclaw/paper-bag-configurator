// Artwork layout (docs/SPEC.md §3a): one artwork per wall, or ONE wrap-around artwork for the whole bag. Pure TS.
//
// Every consumer (3D renderer, 2D dieline, ink coverage, exports) reads artwork per wall through
// `resolvePanelArtwork(s)`: the artwork a wall shows, its placement and the ARTWORK AREA that placement refers to, in
// that wall's panel-local mm. A wrap is expressed per wall as the whole wall-row area shifted left by the wall's
// position in the row. Panel-local x of every wall runs with sheet x (seen from outside, `buildDieline` columns start
// at panel x = 0), so the same image lands contiguously on LEFT | FRONT | RIGHT | BACK — in 3D (incl. the bottom
// pieces, which live in the UV space of their wall), on the dieline and in the coverage sampling — through the
// existing `computePanelUvTransform(panelSize, image, placement, area)` without any consumer knowing about the wrap.
//
// Wrap coordinates: x from LEFT's free edge (sheet x = 0, the seam) to BACK's outer edge (2W + 2D, the glue-flap
// hinge — the flap itself is never printed), y from the bottom line (y = 0) up to the top edge (y = H); with
// `extendToBottom` the area also covers the bottom allowance, y ∈ [−a, H], exactly like a single wall (§4f).

import { getPanelArtworkArea, type PanelArtworkArea, type Size2 } from './artworkPlacement';
import { DEFAULT_ARTWORK_LAYOUT } from './config/productCatalog';
import { getBottomAllowance } from './geometry/tube';
import { getPanelSize } from './panels';
import type {
  Artwork,
  ArtworkLayout,
  ArtworkPlacement,
  ArtworkTarget,
  BagConfiguration,
  Dimensions,
  PanelPosition,
  WrapArtwork,
} from './types';

/** Walls in the order the wrap artwork runs over them — the sheet order of the dieline columns (§4b). */
export const WRAP_PANEL_ORDER: readonly PanelPosition[] = ['LEFT', 'FRONT', 'RIGHT', 'BACK'];

/** The configuration fields artwork resolution needs; the layout fields may be missing in older data. */
export type ArtworkSource = Pick<BagConfiguration, 'dimensions' | 'panels'> &
  Partial<Pick<BagConfiguration, 'artworkLayout' | 'wrapArtwork'>>;

/** Artwork of one wall as every consumer should see it. */
export type ResolvedPanelArtwork = {
  position: PanelPosition;
  /** Where the artwork comes from: the wall itself or the whole-bag wrap. */
  source: ArtworkTarget;
  artwork: Artwork | null;
  placement: ArtworkPlacement;
  /** Artwork area of the placement in this wall's panel-local mm (may extend beyond the wall, e.g. for a wrap). */
  area: PanelArtworkArea;
};

export type ResolvedPanelArtworks = Record<PanelPosition, ResolvedPanelArtwork>;

const EMPTY_WRAP: WrapArtwork = { artwork: null, placement: { mode: 'FILL', extendToBottom: false } };

/** Active layout; older data without the field is per wall. */
export function getArtworkLayout(configuration: Partial<Pick<BagConfiguration, 'artworkLayout'>>): ArtworkLayout {
  return configuration.artworkLayout === 'WRAP' || configuration.artworkLayout === 'PER_PANEL'
    ? configuration.artworkLayout
    : DEFAULT_ARTWORK_LAYOUT;
}

/** The whole-bag artwork slot (empty in older data without it). */
export function getWrapArtwork(configuration: Partial<Pick<BagConfiguration, 'wrapArtwork'>>): WrapArtwork {
  return configuration.wrapArtwork ?? EMPTY_WRAP;
}

/** x of the wall's left edge (seen from outside) in the wall row: LEFT 0, FRONT D, RIGHT D + W, BACK 2D + W. */
export function getWrapPanelOffset(position: PanelPosition, dimensions: Dimensions): number {
  let offset = 0;
  for (const wall of WRAP_PANEL_ORDER) {
    if (wall === position) return offset;
    offset += getPanelSize(wall, dimensions).width;
  }
  return offset;
}

/** Visible size of the wall row: (2W + 2D) × H. */
export function getWrapSize(dimensions: Dimensions): Size2 {
  return { width: 2 * dimensions.width + 2 * dimensions.depth, height: dimensions.height };
}

/** Artwork area of the wrap in wrap coordinates: (2W + 2D) × H, or × (H + a) from y = −a with `extendToBottom`. */
export function getWrapArtworkArea(
  dimensions: Dimensions,
  placement: Pick<ArtworkPlacement, 'extendToBottom'>,
): PanelArtworkArea {
  const { width, height } = getWrapSize(dimensions);
  if (!placement.extendToBottom) return { x: 0, y: 0, width, height };
  const a = getBottomAllowance(dimensions);
  return { x: 0, y: -a, width, height: height + a };
}

/** Visible size an artwork target is printed on: the wall, or the whole wall row for the wrap. */
export function getArtworkTargetSize(target: ArtworkTarget, dimensions: Dimensions): Size2 {
  return target === 'WRAP' ? getWrapSize(dimensions) : getPanelSize(target, dimensions);
}

/**
 * Artwork area a target's placement refers to, in the target's own coordinates (panel-local mm for a wall, wrap
 * coordinates for the wrap). Only the size matters to the placement editing helpers (offsets are centre-relative).
 */
export function getArtworkTargetArea(
  target: ArtworkTarget,
  dimensions: Dimensions,
  placement: Pick<ArtworkPlacement, 'extendToBottom'>,
): PanelArtworkArea {
  return target === 'WRAP' ? getWrapArtworkArea(dimensions, placement) : getPanelArtworkArea(target, dimensions, placement);
}

/** The stored artwork + placement of a target (whether or not its layout is active). */
export function getArtworkSlot(
  configuration: ArtworkSource,
  target: ArtworkTarget,
): { artwork: Artwork | null; placement: ArtworkPlacement } {
  if (target === 'WRAP') return getWrapArtwork(configuration);
  const { artwork, placement } = configuration.panels[target];
  return { artwork, placement };
}

/** Targets of the active layout: the four walls, or the wrap alone. */
export function getActiveArtworkTargets(configuration: Partial<Pick<BagConfiguration, 'artworkLayout'>>): ArtworkTarget[] {
  return getArtworkLayout(configuration) === 'WRAP' ? ['WRAP'] : [...WRAP_PANEL_ORDER];
}

/** True when the active layout carries at least one artwork (inactive, kept artwork does not count). */
export function hasActiveArtwork(configuration: ArtworkSource): boolean {
  return getActiveArtworkTargets(configuration).some((target) => getArtworkSlot(configuration, target).artwork !== null);
}

/** What wall `position` shows under the active layout (see the file comment). */
export function resolvePanelArtwork(configuration: ArtworkSource, position: PanelPosition): ResolvedPanelArtwork {
  const { dimensions } = configuration;
  if (getArtworkLayout(configuration) === 'WRAP') {
    const { artwork, placement } = getWrapArtwork(configuration);
    const area = getWrapArtworkArea(dimensions, placement);
    return {
      position,
      source: 'WRAP',
      artwork,
      placement,
      area: { ...area, x: area.x - getWrapPanelOffset(position, dimensions) },
    };
  }
  const { artwork, placement } = configuration.panels[position];
  return { position, source: position, artwork, placement, area: getPanelArtworkArea(position, dimensions, placement) };
}

export function resolvePanelArtworks(configuration: ArtworkSource): ResolvedPanelArtworks {
  return {
    FRONT: resolvePanelArtwork(configuration, 'FRONT'),
    BACK: resolvePanelArtwork(configuration, 'BACK'),
    LEFT: resolvePanelArtwork(configuration, 'LEFT'),
    RIGHT: resolvePanelArtwork(configuration, 'RIGHT'),
  };
}
