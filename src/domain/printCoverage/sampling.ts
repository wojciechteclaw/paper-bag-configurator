// Shared sampling of the placed artwork (docs/SPEC.md §4d/§4f). Pure TS, no DOM.
//
// Every artwork area of the dieline (the wall rect of each sheet column — plus its bottom allowance when the panel's
// placement has `extendToBottom` — never the glue flap or the bleed) is sampled on a regular grid in panel-local mm.
// Each grid cell centre is mapped to texture coordinates with the same `computePanelUvTransform` the 3D renderer and
// the 2D dieline use, so a cell carries ink exactly where the previews show the image. Cells outside the image
// (after placement) are bare paper and are not visited. Used by `computeInkCoverage` and `computeArtworkPalette`.

import { computePanelUvTransform, getPanelArtworkArea, type PanelArtworkArea, type Size2 } from '../artworkPlacement';
import type { Dieline } from '../dieline/types';
import { getPanelSize } from '../panels';
import type { ArtworkPlacement, PanelPosition, PaperColor } from '../types';
import { deltaE76, rgbToLab, type Lab } from './color';

/** Downscaled artwork pixels: RGBA, row-major, row 0 = TOP of the image (canvas `ImageData` layout). */
export type PixelSample = {
  width: number;
  height: number;
  data: ArrayLike<number>;
};

export type CoveragePanelInput = {
  /** Pixel size of the source image — the placement is defined against it (the sample may be smaller). */
  imageSize: Size2;
  placement: ArtworkPlacement;
  /**
   * Artwork area the placement refers to, panel-local mm (`resolvePanelArtwork(...).area` — e.g. the whole wall row
   * for a wrap artwork, docs/SPEC.md §3a). Omitted: the panel's own area (`getPanelArtworkArea`).
   */
  area?: PanelArtworkArea;
  sample: PixelSample;
};

export type SamplingInput = {
  dieline: Pick<Dieline, 'sheet' | 'segments' | 'dimensions'>;
  /** Panels without artwork (or without a decoded sample yet) are left out or null. */
  panels: Partial<Record<PanelPosition, CoveragePanelInput | null>>;
};

export type ArtworkCellVisitor = {
  /** Every sheet column of a wall: its visible wall area and the sampled (printable) area, mm². */
  onSegment?: (position: PanelPosition, wallArea: number, printArea: number) => void;
  /** A grid cell inside the placed image: `pixel` indexes `sample` (RGBA offset = pixel × 4). */
  onCell: (position: PanelPosition, sample: PixelSample, pixel: number, cellArea: number) => void;
};

const validSample = (sample: PixelSample | undefined): sample is PixelSample =>
  !!sample && sample.width > 0 && sample.height > 0 && sample.data.length >= sample.width * sample.height * 4;

/** Walks the sampling grid of every artwork area of the dieline (see the file comment). */
export function walkArtworkCells(input: SamplingInput, gridCellsLongSide: number, visitor: ArtworkCellVisitor): void {
  const { dieline } = input;
  const height = dieline.dimensions.height;

  for (const segment of dieline.segments) {
    const segmentWidth = segment.x1 - segment.x0;
    if (segmentWidth <= 0 || height <= 0) continue;
    const position = segment.panel;
    const panelSize = getPanelSize(position, dieline.dimensions);
    const artwork = input.panels[position];
    // Artwork area: the wall (y ∈ [0, H]) or, extended to the bottom, y ∈ [−a, H] (SPEC §4f — counted then). A wrap
    // area is wider than the wall but has the same vertical extent; only this column (x ∈ the wall) is sampled.
    const area = artwork
      ? (artwork.area ?? getPanelArtworkArea(position, dieline.dimensions, artwork.placement))
      : { x: 0, y: 0, width: panelSize.width, height };
    visitor.onSegment?.(position, segmentWidth * height, segmentWidth * area.height);
    const sample = artwork?.sample;
    if (!artwork || !validSample(sample)) continue;

    const { repeat, offset, rotation } = computePanelUvTransform(panelSize, artwork.imageSize, artwork.placement, area);
    const c = Math.round(Math.cos(rotation) * 1e12) / 1e12;
    const s = Math.round(Math.sin(rotation) * 1e12) / 1e12;
    const [rx, ry] = repeat;
    const [ox, oy] = offset;

    const cell = Math.max(panelSize.width, panelSize.height) / Math.max(1, gridCellsLongSide);
    const nx = Math.max(1, Math.ceil(segmentWidth / cell));
    const ny = Math.max(1, Math.ceil(area.height / cell));
    const cw = segmentWidth / nx;
    const ch = area.height / ny;
    const cellArea = cw * ch;
    const sw = sample.width;
    const sh = sample.height;

    for (let iy = 0; iy < ny; iy++) {
      const v = (area.y + (iy + 0.5) * ch) / panelSize.height;
      for (let ix = 0; ix < nx; ix++) {
        const u = (segment.localX0 + (ix + 0.5) * cw) / panelSize.width;
        // t = diag(repeat)·R(−θ)·uv + offset (three.js uv transform with centre (0, 0)).
        const tx = rx * (c * u + s * v) + ox;
        const ty = ry * (-s * u + c * v) + oy;
        if (tx < 0 || tx > 1 || ty < 0 || ty > 1) continue; // outside the image: bare paper
        const px = Math.min(sw - 1, Math.floor(tx * sw));
        const py = Math.min(sh - 1, Math.floor((1 - ty) * sh));
        visitor.onCell(position, sample, py * sw + px, cellArea);
      }
    }
  }
}

export type InkPixelRules = { minAlpha: number; nearWhiteDeltaE: number };

const WHITE_LAB: Lab = { l: 100, a: 0, b: 0 };

/**
 * Ink of one pixel: null when it carries none (alpha < minAlpha; on WHITE paper also near-white = bare paper; on
 * BROWN paper white is white ink), else its colour and alpha weight (0–1).
 */
export function classifyInkPixel(
  data: ArrayLike<number>,
  pixel: number,
  paperColor: PaperColor,
  rules: InkPixelRules,
): { lab: Lab; weight: number } | null {
  const o = pixel * 4;
  const alpha = data[o + 3];
  if (alpha < rules.minAlpha) return null;
  const lab = rgbToLab(data[o], data[o + 1], data[o + 2]);
  if (paperColor === 'WHITE' && deltaE76(lab, WHITE_LAB) <= rules.nearWhiteDeltaE) return null;
  return { lab, weight: alpha / 255 };
}
