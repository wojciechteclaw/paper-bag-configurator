// Layer compositing plan (docs/SPEC.md §3b). Pure TS: no DOM, no Three.js.
//
// A wall that shows several artwork layers (whole-bag layers) is rendered in 3D from ONE flattened image: the layers
// drawn bottom → top into a canvas that covers the wall's COMPOSITE FRAME — the visible wall [0, Pw] × [0, H], extended
// down to the bottom allowance [−a, 0] when any layer extends to the bottom. The composite is then mapped onto the
// wall like any single artwork: FILL over the frame (`computePanelUvTransform(panelSize, canvas, FILL, frame)`), so the
// bottom pieces and sheet pieces keep working unchanged. Each layer is clipped to its own artwork area (a layer
// without "extend to bottom" never reaches below the bottom line) and placed with the same
// `computePanelUvTransform` as everywhere else, expressed as a canvas matrix here so the renderer only draws.

import {
  computePanelUvTransform,
  getArtworkRect,
  uvTransformToPanelMatrix,
  type Affine2,
  type PanelArtworkArea,
  type Size2,
} from './artworkPlacement';
import type { Artwork, ArtworkPlacement } from './types';

/** A layer to composite: image (pixel size), placement and the area it refers to, in the wall's panel-local mm. */
export type CompositeLayerInput = {
  artwork: Pick<Artwork, 'fileUrl' | 'width' | 'height'>;
  placement: ArtworkPlacement;
  area: PanelArtworkArea;
};

export type CompositeLayerPlan = {
  artwork: CompositeLayerInput['artwork'];
  /**
   * Canvas transform (`ctx.setTransform(a, b, c, d, e, f)`) mapping image pixels (x right, y DOWN, the image drawn at
   * 0, 0 with its pixel size `artwork.width × artwork.height`) to canvas pixels (y down, row 0 = top of the frame).
   */
  matrix: Affine2;
  /** Canvas-pixel clip rectangle of the layer (its artwork area ∩ the frame); empty layers are left out. */
  clip: { x: number; y: number; width: number; height: number };
};

export type CompositePlan = {
  /** Area the canvas covers, panel-local mm. */
  frame: PanelArtworkArea;
  /** Canvas size, px. */
  width: number;
  height: number;
  /** px per mm. */
  pixelsPerMm: number;
  /** Bottom → top. */
  layers: CompositeLayerPlan[];
};

export type CompositeOptions = {
  /** Upper bound of the canvas's longer side, px (texture size / memory limit). */
  maxLongSidePx: number;
  /** Lower bound of the resolution, px per mm (tiny images still give a usable canvas). Default 1. */
  minPixelsPerMm?: number;
};

const positive = (size: Size2) => Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0;

/** Composite frame of a wall: the visible wall, extended down to the lowest layer area (the bottom allowance). */
export function getCompositeFrame(panelSize: Size2, layers: readonly Pick<CompositeLayerInput, 'area'>[]): PanelArtworkArea {
  const bottom = Math.min(0, ...layers.map((layer) => layer.area.y));
  return { x: 0, y: bottom, width: panelSize.width, height: panelSize.height - bottom };
}

/** Native resolution of a placed layer, image px per mm on the bag (the finer axis). */
function layerPixelsPerMm(panelSize: Size2, layer: CompositeLayerInput): number {
  const image = { width: layer.artwork.width, height: layer.artwork.height };
  if (!positive(image)) return 0;
  const rect = getArtworkRect(panelSize, image, layer.placement, layer.area);
  return Math.max(image.width / rect.width, image.height / rect.height);
}

/**
 * Plans the composite of `layers` (bottom → top) on a wall of `panelSize` mm: frame, canvas size and one canvas
 * matrix + clip per layer. The resolution follows the finest layer (no upscaling beyond it), capped so the canvas's
 * longer side stays within `maxLongSidePx`.
 */
export function planArtworkComposite(
  panelSize: Size2,
  layers: readonly CompositeLayerInput[],
  { maxLongSidePx, minPixelsPerMm = 1 }: CompositeOptions,
): CompositePlan {
  const frame = getCompositeFrame(panelSize, layers);
  const longSide = Math.max(frame.width, frame.height);
  const finest = Math.max(0, ...layers.map((layer) => layerPixelsPerMm(panelSize, layer)));
  const cap = longSide > 0 ? maxLongSidePx / longSide : 0;
  const k = Math.max(Math.min(minPixelsPerMm, cap), Math.min(finest, cap));
  const width = Math.max(1, Math.round(frame.width * k));
  const height = Math.max(1, Math.round(frame.height * k));
  // Exact scale per axis after rounding the canvas size.
  const kx = width / frame.width;
  const ky = height / frame.height;
  const top = frame.y + frame.height;

  const planned: CompositeLayerPlan[] = [];
  for (const layer of layers) {
    const { width: iw, height: ih } = layer.artwork;
    if (!(iw > 0 && ih > 0) || !positive(panelSize)) continue;
    // Clip: the layer's artwork area within the frame, in canvas px.
    const x0 = Math.max(frame.x, layer.area.x);
    const x1 = Math.min(frame.x + frame.width, layer.area.x + layer.area.width);
    const y0 = Math.max(frame.y, layer.area.y);
    const y1 = Math.min(top, layer.area.y + layer.area.height);
    if (x1 <= x0 || y1 <= y0) continue;
    // Texture t (y up) → panel mm, from the shared placement transform.
    const p = uvTransformToPanelMatrix(panelSize, computePanelUvTransform(panelSize, { width: iw, height: ih }, layer.placement, layer.area));
    // Image px (x right, y down) → t = (px / iw, 1 − py / ih) → panel mm → canvas px (x right, y down from the top).
    planned.push({
      artwork: layer.artwork,
      matrix: {
        a: (kx * p.a) / iw,
        b: (-ky * p.b) / iw,
        c: (-kx * p.c) / ih,
        d: (ky * p.d) / ih,
        e: kx * (p.c + p.e - frame.x),
        f: ky * (top - p.d - p.f),
      },
      clip: { x: (x0 - frame.x) * kx, y: (top - y1) * ky, width: (x1 - x0) * kx, height: (y1 - y0) * ky },
    });
  }
  return { frame, width, height, pixelsPerMm: Math.min(kx, ky), layers: planned };
}
