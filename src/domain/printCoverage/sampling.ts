// Shared sampling of the placed artwork (docs/SPEC.md §4d/§4f, layers §3b). Pure TS, no DOM.
//
// Every artwork area of the dieline (the wall rect of each sheet column — plus its bottom allowance when a layer's
// placement has `extendToBottom` — never the glue flap or the bleed) is sampled on a regular grid in panel-local mm.
// Each grid cell centre is mapped to texture coordinates with the same `computePanelUvTransform` the 3D renderer and
// the 2D dieline use, so a cell carries ink exactly where the previews show the image. Cells outside every image
// (after placement) are bare paper and are not visited. Used by `computeInkCoverage` and `computeArtworkPalette`.
//
// A wall may show several layers (whole-bag layers, bottom → top). Per cell the layers are composited like on screen
// ("over", straight alpha): what counts is the COMPOSITE colour, so a logo covering the background replaces its ink
// instead of adding to it. A cell where one layer's pixel alone is visible is reported with that layer's sample and
// pixel (the consumers' per-pixel memo stays effective); a real blend is written once per distinct colour into a
// per-walk blend sample and reported from there.
//
// Window openings (gusseted bag, docs/SPEC.md §2b) are cut out of the paper: their cells are never visited and their
// area is not part of the wall / printable area.

import { computePanelUvTransform, type PanelArtworkArea, type Size2 } from '../artworkPlacement';
import type { Dieline } from '../dieline/types';
import { getPanelSize } from '../panels';
import type { ArtworkPlacement, PanelPosition, PaperColor } from '../types';
import { deltaE76, rgbToLab, type Lab } from './color';
import { isInWindowOpening } from '../window';

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
   * Artwork area the placement refers to, panel-local mm (`resolvePanelArtwork(...).layers[i].area` — e.g. the whole
   * wall row for a whole-bag layer, docs/SPEC.md §3a). Omitted: the panel's own area (the wall, or the wall plus the
   * dieline's bottom allowance with `extendToBottom` — block zone or gusseted strip, like `getPanelArtworkArea`).
   */
  area?: PanelArtworkArea;
  /**
   * Horizontal extent of this copy of a cyclic whole-bag layer, panel-local mm (`ResolvedArtworkLayer.clipX`). The area
   * clips vertically only; horizontally the sampled column (the wall) and this extent do.
   */
  clipX?: { x0: number; x1: number };
  sample: PixelSample;
};

export type SamplingInput = {
  dieline: Pick<Dieline, 'sheet' | 'segments' | 'dimensions'> & Partial<Pick<Dieline, 'windows'>>;
  /**
   * Artwork of every wall: one input, or its layers bottom → top. Walls without artwork are left out, null or [];
   * layers without a decoded sample (yet) are left out.
   */
  panels: Partial<Record<PanelPosition, CoveragePanelInput | readonly CoveragePanelInput[] | null>>;
};

export type ArtworkCellVisitor = {
  /** Every sheet column of a wall: its visible wall area and the sampled (printable) area, mm². */
  onSegment?: (position: PanelPosition, wallArea: number, printArea: number) => void;
  /**
   * A grid cell inside the placed image(s): `pixel` indexes `sample` (RGBA offset = pixel × 4). `sample` is a layer's
   * sample, or the walk's blend sample for a composite of several layers; either way a (sample, pixel) pair always
   * denotes the same colour within one walk.
   */
  onCell: (position: PanelPosition, sample: PixelSample, pixel: number, cellArea: number) => void;
};

const validSample = (sample: PixelSample | undefined): sample is PixelSample =>
  !!sample && sample.width > 0 && sample.height > 0 && sample.data.length >= sample.width * sample.height * 4;

const layersOf = (input: CoveragePanelInput | readonly CoveragePanelInput[] | null | undefined): readonly CoveragePanelInput[] =>
  !input ? [] : Array.isArray(input) ? input : [input as CoveragePanelInput];

/** A layer prepared for the cell loop: texture transform, sample and area bounds (panel-local mm). */
type PreparedLayer = {
  sample: PixelSample;
  c: number;
  s: number;
  rx: number;
  ry: number;
  ox: number;
  oy: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
};

/** The layer's artwork area: given, or the panel's own (wall, plus the dieline's bottom allowance when extended). */
function layerArea(layer: CoveragePanelInput, panelSize: Size2, allowance: number): PanelArtworkArea {
  if (layer.area) return layer.area;
  if (!layer.placement.extendToBottom) return { x: 0, y: 0, width: panelSize.width, height: panelSize.height };
  return { x: 0, y: -allowance, width: panelSize.width, height: panelSize.height + allowance };
}

function prepareLayer(
  layer: CoveragePanelInput,
  panelSize: Size2,
  allowance: number,
): PreparedLayer | null {
  if (!validSample(layer.sample)) return null;
  const area = layerArea(layer, panelSize, allowance);
  const { repeat, offset, rotation } = computePanelUvTransform(panelSize, layer.imageSize, layer.placement, area);
  return {
    sample: layer.sample,
    c: Math.round(Math.cos(rotation) * 1e12) / 1e12,
    s: Math.round(Math.sin(rotation) * 1e12) / 1e12,
    rx: repeat[0],
    ry: repeat[1],
    ox: offset[0],
    oy: offset[1],
    x0: layer.clipX?.x0 ?? Number.NEGATIVE_INFINITY,
    x1: layer.clipX?.x1 ?? Number.POSITIVE_INFINITY,
    y0: area.y,
    y1: area.y + area.height,
  };
}

/** Pixel of `layer` at panel point (x, y) / panel UV (u, v), or −1 outside its area or image. */
function pixelAt(layer: PreparedLayer, x: number, y: number, u: number, v: number): number {
  if (x < layer.x0 || x >= layer.x1 || y < layer.y0 || y > layer.y1) return -1;
  // t = diag(repeat)·R(−θ)·uv + offset (three.js uv transform with centre (0, 0)).
  const tx = layer.rx * (layer.c * u + layer.s * v) + layer.ox;
  const ty = layer.ry * (-layer.s * u + layer.c * v) + layer.oy;
  if (tx < 0 || tx > 1 || ty < 0 || ty > 1) return -1; // outside the image: bare paper
  const { width: sw, height: sh } = layer.sample;
  const px = Math.min(sw - 1, Math.floor(tx * sw));
  const py = Math.min(sh - 1, Math.floor((1 - ty) * sh));
  return py * sw + px;
}

/** Grid of one sheet column: cells across the column width × the vertical extent [bottom, H]. */
function columnGrid(segmentWidth: number, panelSize: Size2, extentHeight: number, gridCellsLongSide: number) {
  const cell = Math.max(panelSize.width, panelSize.height) / Math.max(1, gridCellsLongSide);
  const nx = Math.max(1, Math.ceil(segmentWidth / cell));
  const ny = Math.max(1, Math.ceil(extentHeight / cell));
  return { nx, ny, cw: segmentWidth / nx, ch: extentHeight / ny };
}

/** Walks the sampling grid of every artwork area of the dieline (see the file comment). */
export function walkArtworkCells(input: SamplingInput, gridCellsLongSide: number, visitor: ArtworkCellVisitor): void {
  const { dieline } = input;
  const height = dieline.dimensions.height;

  // Per column: the prepared layers and the vertical extent they cover (down to the lowest layer area).
  const columns = dieline.segments.map((segment) => {
    const position = segment.panel;
    const panelSize = getPanelSize(position, dieline.dimensions);
    const layers = layersOf(input.panels[position]);
    // The column's bottom allowance (block zone or gusseted strip) is the height of its allowance rectangle.
    const allowance = segment.allowance.height;
    const bottom = Math.min(
      0,
      ...layers.map((layer) => layerArea(layer, panelSize, allowance).y),
    );
    const prepared = layers
      .map((layer) => prepareLayer(layer, panelSize, allowance))
      .filter((layer): layer is PreparedLayer => layer !== null);
    // Openings on this panel (panel-local mm); only the part inside this column matters.
    const holes = (dieline.windows ?? []).filter((w) => w.panel === position).map((w) => w.localOpening);
    return { segment, position, panelSize, hasArtwork: layers.length > 0, bottom, prepared, holes };
  });

  // Blend sample for composites of several layers: one pixel per distinct blended colour (capacity = cells that may
  // blend, so a pixel index is never reused within the walk).
  let blend: { sample: PixelSample & { data: Uint8ClampedArray }; index: Map<number, number> } | null = null;
  const blendCapacity = columns.reduce((sum, { segment, panelSize, bottom, prepared }) => {
    const segmentWidth = segment.x1 - segment.x0;
    if (prepared.length < 2 || segmentWidth <= 0 || height <= 0) return sum;
    const { nx, ny } = columnGrid(segmentWidth, panelSize, height - bottom, gridCellsLongSide);
    return sum + nx * ny;
  }, 0);
  if (blendCapacity > 0) {
    blend = {
      sample: { width: blendCapacity, height: 1, data: new Uint8ClampedArray(blendCapacity * 4) },
      index: new Map(),
    };
  }

  const hits: number[] = []; // layer index, pixel — top → bottom
  for (const { segment, position, panelSize, hasArtwork, bottom, prepared, holes } of columns) {
    const segmentWidth = segment.x1 - segment.x0;
    if (segmentWidth <= 0 || height <= 0) continue;
    // Printable extent: the wall (y ∈ [0, H]) or, with a layer extended to the bottom, down to y = −a (SPEC §4f —
    // counted then). A wrap area is wider than the wall but only this column (x ∈ the wall) is sampled.
    const extentHeight = height - bottom;
    const cut = (y0: number) =>
      holes.reduce((sum, h) => {
        const w = Math.min(h.x + h.width, segment.localX0 + segmentWidth) - Math.max(h.x, segment.localX0);
        const hh = Math.min(h.y + h.height, height) - Math.max(h.y, y0);
        return sum + (w > 0 && hh > 0 ? w * hh : 0);
      }, 0);
    visitor.onSegment?.(
      position,
      segmentWidth * height - cut(0),
      hasArtwork ? segmentWidth * extentHeight - cut(bottom) : segmentWidth * height - cut(0),
    );
    if (prepared.length === 0) continue;

    const { nx, ny, cw, ch } = columnGrid(segmentWidth, panelSize, extentHeight, gridCellsLongSide);
    const cellArea = cw * ch;
    const single = prepared.length === 1 ? prepared[0] : null;

    for (let iy = 0; iy < ny; iy++) {
      const y = bottom + (iy + 0.5) * ch;
      const v = y / panelSize.height;
      for (let ix = 0; ix < nx; ix++) {
        const x = segment.localX0 + (ix + 0.5) * cw;
        const u = x / panelSize.width;
        if (holes.length > 0 && holes.some((h) => isInWindowOpening(h, x, y))) continue; // no paper: no ink
        if (single) {
          const pixel = pixelAt(single, x, y, u, v);
          if (pixel >= 0) visitor.onCell(position, single.sample, pixel, cellArea);
          continue;
        }
        // Visible layer pixels, top → bottom, down to the first opaque one.
        hits.length = 0;
        for (let l = prepared.length - 1; l >= 0; l--) {
          const pixel = pixelAt(prepared[l], x, y, u, v);
          if (pixel < 0) continue;
          const alpha = prepared[l].sample.data[pixel * 4 + 3];
          if (alpha <= 0) continue;
          hits.push(l, pixel);
          if (alpha >= 255) break;
        }
        if (hits.length === 0) continue;
        if (hits.length === 2) {
          visitor.onCell(position, prepared[hits[0]].sample, hits[1], cellArea);
          continue;
        }
        const blended = blendHits(prepared, hits, blend!);
        visitor.onCell(position, blend!.sample, blended, cellArea);
      }
    }
  }
}

/**
 * Composites the hit pixels ("over", straight alpha, bottom → top) and returns the blend-sample pixel of the result
 * (one pixel per distinct colour).
 */
function blendHits(
  prepared: readonly PreparedLayer[],
  hits: readonly number[],
  blend: { sample: PixelSample & { data: Uint8ClampedArray }; index: Map<number, number> },
): number {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0; // premultiplied accumulators, 0–1 alpha
  for (let h = hits.length - 2; h >= 0; h -= 2) {
    const data = prepared[hits[h]].sample.data;
    const o = hits[h + 1] * 4;
    const alpha = data[o + 3] / 255;
    r = data[o] * alpha + r * (1 - alpha);
    g = data[o + 1] * alpha + g * (1 - alpha);
    b = data[o + 2] * alpha + b * (1 - alpha);
    a = alpha + a * (1 - alpha);
  }
  const rr = a > 0 ? Math.round(r / a) : 0;
  const gg = a > 0 ? Math.round(g / a) : 0;
  const bb = a > 0 ? Math.round(b / a) : 0;
  const aa = Math.round(a * 255);
  const key = ((rr << 24) | (gg << 16) | (bb << 8) | aa) >>> 0;
  let pixel = blend.index.get(key);
  if (pixel === undefined) {
    pixel = blend.index.size;
    blend.index.set(key, pixel);
    const o = pixel * 4;
    blend.sample.data[o] = rr;
    blend.sample.data[o + 1] = gg;
    blend.sample.data[o + 2] = bb;
    blend.sample.data[o + 3] = aa;
  }
  return pixel;
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
