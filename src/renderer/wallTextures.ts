// Artwork textures of the bag walls, shared by every bag model (block bottom: BagModel, gusseted-bag bag:
// GussetedBagModel), so all of them show per-wall artwork and whole-bag layers identically (docs/SPEC.md §3a, §3b).

import { useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import type { Texture } from 'three';
import { planArtworkComposite } from '../domain/artworkComposite';
import type { ResolvedPanelArtwork, ResolvedPanelArtworks } from '../domain/artworkLayout';
import { getPanelSize } from '../domain/panels';
import type { ArtworkPlacement, Dimensions, PanelPosition } from '../domain/types';
import { COMPOSITE_MAX_SIDE_PX } from './constants';
import {
  useArtworkTextures,
  useCompositeTexture,
  usePanelUvTransform,
  useTextureView,
  type ArtworkTextures,
} from './panelTexture';

/** A composite is mapped like one image stretched over its frame (the frame is passed as the artwork area). */
const COMPOSITE_PLACEMENT: ArtworkPlacement = { mode: 'FILL', extendToBottom: false };

/**
 * Artwork texture of one wall with its placement applied over the wall's artwork area (wall, or wall + bottom
 * allowance; for a whole-bag layer the wrap area expressed in this wall's coordinates). One texture per wall, shared
 * by the wall mesh and the bottom piece(s) formed from its allowance, so the image continues across the bottom crease
 * in one UV space. One layer: a view of the shared image texture with its own transform. Several layers (docs/SPEC.md
 * §3b): one canvas composite of all layers over the wall's composite frame (`planArtworkComposite`), mapped FILL over
 * that frame — no stacked meshes, so no z-fighting, and bottom / sheet pieces work unchanged.
 */
export function useWallTexture(
  resolved: ResolvedPanelArtwork,
  dimensions: Dimensions,
  textures: ArtworkTextures,
  maxCompositeSidePx: number,
): Texture | null {
  const { layers, position } = resolved;
  const { width: pw, height: ph } = getPanelSize(position, dimensions);
  const single = layers.length === 1 ? layers[0] : null;
  const view = useTextureView(single ? (textures.get(single.artwork.fileUrl) ?? null) : null);
  const plan = useMemo(
    () =>
      layers.length > 1
        ? planArtworkComposite({ width: pw, height: ph }, layers, { maxLongSidePx: maxCompositeSidePx })
        : null,
    [layers, pw, ph, maxCompositeSidePx],
  );
  const composite = useCompositeTexture(plan, textures);
  const texture = single ? view : composite;
  usePanelUvTransform(
    texture,
    { width: pw, height: ph },
    single ? single.artwork.width : (plan?.width ?? 0),
    single ? single.artwork.height : (plan?.height ?? 0),
    single ? single.placement : COMPOSITE_PLACEMENT,
    single ? single.area : plan?.frame,
  );
  return texture;
}

/**
 * The artwork texture of every wall (single-layer view or multi-layer composite, `useWallTexture`), with every distinct
 * image loaded once for the whole bag (a whole-bag layer is shown by all four walls). Shared by every bag model
 * (block bottom, gusseted-bag bag) so all of them show artwork identically.
 */
export function useBagWallTextures(artworks: ResolvedPanelArtworks, dimensions: Dimensions): Record<PanelPosition, Texture | null> {
  const urls = useMemo(
    () => Object.values(artworks).flatMap((panel) => panel.layers.map((layer) => layer.artwork.fileUrl)),
    [artworks],
  );
  const loaded = useArtworkTextures(urls);
  const maxTextureSize = useThree((s) => s.gl.capabilities.maxTextureSize);
  const maxCompositeSidePx = Math.min(COMPOSITE_MAX_SIDE_PX, maxTextureSize || COMPOSITE_MAX_SIDE_PX);
  return {
    FRONT: useWallTexture(artworks.FRONT, dimensions, loaded, maxCompositeSidePx),
    BACK: useWallTexture(artworks.BACK, dimensions, loaded, maxCompositeSidePx),
    LEFT: useWallTexture(artworks.LEFT, dimensions, loaded, maxCompositeSidePx),
    RIGHT: useWallTexture(artworks.RIGHT, dimensions, loaded, maxCompositeSidePx),
  };
}
