// Ink coverage estimate (docs/SPEC.md §4d). Pure TS: works on plain RGBA arrays, no DOM.
//
// Every artwork area of the dieline (the wall rect of each sheet column — plus its bottom allowance when the panel's
// placement has `extendToBottom`, SPEC §4f — never the glue flap
// or the bleed) is sampled on a regular grid in panel-local mm. Each grid cell centre is mapped to texture
// coordinates with the same `computePanelUvTransform` the 3D renderer and the 2D dieline use, so a cell carries
// ink exactly where the previews show the image. Cells outside the image (after placement) are bare paper.
// The pixel under the cell is classified once (memoised per pixel):
// - alpha < minAlpha → no ink; otherwise ink weighted by alpha;
// - WHITE paper: a pixel within `nearWhiteDeltaE` of white is paper, not ink; BROWN paper: white is (white) ink;
// - an inked pixel goes to the Pantone whose preview colour is nearest in CIELAB (CIE76 ΔE);
//   with an empty Pantone list the ink stays unassigned.

import { computePanelUvTransform, getPanelArtworkArea, type Size2 } from '../artworkPlacement';
import { PRINT_COVERAGE_RULES } from '../config/productCatalog';
import type { Dieline } from '../dieline/types';
import { getPanelSize } from '../panels';
import type { ArtworkPlacement, PantoneColor, PanelPosition, PaperColor } from '../types';
import { deltaE76, hexToRgb, rgbToLab, type Lab } from './color';

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
  sample: PixelSample;
};

export type InkCoverageInput = {
  dieline: Pick<Dieline, 'sheet' | 'segments' | 'dimensions'>;
  /** Panels without artwork (or without a decoded sample yet) are left out or null. */
  panels: Partial<Record<PanelPosition, CoveragePanelInput | null>>;
  paperColor: PaperColor;
  pantoneColors: readonly PantoneColor[];
  /** Overrides of `PRINT_COVERAGE_RULES` (tests, tuning). */
  rules?: Partial<InkCoverageRules>;
};

export type InkCoverageRules = {
  minAlpha: number;
  nearWhiteDeltaE: number;
  poorMatchDeltaE: number;
  poorMatchHintShare: number;
  gridCellsLongSide: number;
};

export type CoverageHint = 'NO_PANTONE_COLORS' | 'POOR_COLOR_MATCH';

export type ColorCoverage = {
  code: string;
  hex: string;
  /** mm² */
  area: number;
  /** Share of the sheet area, 0–1. */
  sheetRatio: number;
};

export type PanelCoverage = {
  /** Visible wall area of the panel on the sheet, mm². */
  wallArea: number;
  /** Printable area actually sampled, mm²: the wall, plus its bottom allowance when extended to the bottom (always set by computeInkCoverage). */
  printArea?: number;
  inkArea: number;
  /** mm² per Pantone, same order as the input list. */
  colorAreas: number[];
  unassignedArea: number;
};

export type InkCoverageResult = {
  /** Cut sheet area (dieline sheet incl. glue flap, without bleed), mm². */
  sheetArea: number;
  inkArea: number;
  /** Total ink share of the sheet area, 0–1. */
  sheetRatio: number;
  /** Per Pantone, same order as the input list. */
  colors: ColorCoverage[];
  /** Ink not assigned to any Pantone (only when the list is empty). */
  unassignedArea: number;
  unassignedSheetRatio: number;
  /** Ink whose nearest Pantone preview is farther than `poorMatchDeltaE`, mm² (still counted for that Pantone). */
  poorMatchArea: number;
  panels: Partial<Record<PanelPosition, PanelCoverage>>;
  hints: CoverageHint[];
};

const WHITE_LAB: Lab = { l: 100, a: 0, b: 0 };
const NO_INK = -1;
const UNKNOWN = -2;

type Palette = { labs: Lab[]; count: number };

type PixelClassifier = (index: number) => void;

/** Classifies pixel `index` of `sample` into the shared out-params (memoised per pixel). */
function createClassifier(sample: PixelSample, palette: Palette, paperColor: PaperColor, rules: InkCoverageRules) {
  const size = sample.width * sample.height;
  const classes = new Int16Array(size).fill(UNKNOWN);
  const weights = new Float32Array(size);
  const poor = new Uint8Array(size);
  const { data } = sample;

  const classify: PixelClassifier = (index) => {
    const o = index * 4;
    const alpha = data[o + 3];
    if (alpha < rules.minAlpha) {
      classes[index] = NO_INK;
      return;
    }
    const lab = rgbToLab(data[o], data[o + 1], data[o + 2]);
    if (paperColor === 'WHITE' && deltaE76(lab, WHITE_LAB) <= rules.nearWhiteDeltaE) {
      classes[index] = NO_INK;
      return;
    }
    weights[index] = alpha / 255;
    if (palette.count === 0) {
      classes[index] = 0; // unassigned bucket
      return;
    }
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < palette.count; i++) {
      const distance = deltaE76(lab, palette.labs[i]);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    classes[index] = best;
    poor[index] = bestDistance > rules.poorMatchDeltaE ? 1 : 0;
  };

  return { classes, weights, poor, classify };
}

export function computeInkCoverage(input: InkCoverageInput): InkCoverageResult {
  const rules: InkCoverageRules = { ...PRINT_COVERAGE_RULES, ...input.rules };
  const { dieline, paperColor, pantoneColors } = input;
  const sheetArea = dieline.sheet.width * dieline.sheet.height;
  const labs = pantoneColors.map((color) => {
    const rgb = hexToRgb(color.hex) ?? { r: 0, g: 0, b: 0 };
    return rgbToLab(rgb.r, rgb.g, rgb.b);
  });
  const palette: Palette = { labs, count: labs.length };
  const colorCount = palette.count;

  const colorAreas = new Array<number>(colorCount).fill(0);
  let unassignedArea = 0;
  let poorMatchArea = 0;
  const panels: Partial<Record<PanelPosition, PanelCoverage>> = {};
  const classifiers = new Map<PanelPosition, ReturnType<typeof createClassifier>>();
  const height = dieline.dimensions.height;

  for (const segment of dieline.segments) {
    const segmentWidth = segment.x1 - segment.x0;
    if (segmentWidth <= 0 || height <= 0) continue;
    const position = segment.panel;
    const panelSize = getPanelSize(position, dieline.dimensions);
    const panel =
      panels[position] ??
      (panels[position] = { wallArea: 0, printArea: 0, inkArea: 0, colorAreas: new Array<number>(colorCount).fill(0), unassignedArea: 0 });
    panel.wallArea += segmentWidth * height;

    const artwork = input.panels[position];
    // Artwork area: the wall (y ∈ [0, H]) or, extended to the bottom, y ∈ [−a, H] (SPEC §4f — counted then).
    const area = artwork
      ? getPanelArtworkArea(position, dieline.dimensions, artwork.placement)
      : { x: 0, y: 0, width: panelSize.width, height };
    panel.printArea = (panel.printArea ?? 0) + segmentWidth * area.height;
    const sample = artwork?.sample;
    if (!artwork || !sample || sample.width <= 0 || sample.height <= 0 || sample.data.length < sample.width * sample.height * 4) {
      continue;
    }
    let classifier = classifiers.get(position);
    if (!classifier) {
      classifier = createClassifier(sample, palette, paperColor, rules);
      classifiers.set(position, classifier);
    }
    const { classes, weights, poor, classify } = classifier;

    const { repeat, offset, rotation } = computePanelUvTransform(panelSize, artwork.imageSize, artwork.placement, area);
    const c = Math.round(Math.cos(rotation) * 1e12) / 1e12;
    const s = Math.round(Math.sin(rotation) * 1e12) / 1e12;
    const [rx, ry] = repeat;
    const [ox, oy] = offset;

    const cell = Math.max(panelSize.width, panelSize.height) / Math.max(1, rules.gridCellsLongSide);
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
        const index = py * sw + px;
        if (classes[index] === UNKNOWN) classify(index);
        const klass = classes[index];
        if (klass === NO_INK) continue;
        const area = cellArea * weights[index];
        panel.inkArea += area;
        if (colorCount === 0) {
          panel.unassignedArea += area;
          unassignedArea += area;
        } else {
          panel.colorAreas[klass] += area;
          colorAreas[klass] += area;
          if (poor[index]) poorMatchArea += area;
        }
      }
    }
  }

  const inkArea = colorAreas.reduce((sum, area) => sum + area, 0) + unassignedArea;
  const ratio = (area: number) => (sheetArea > 0 ? area / sheetArea : 0);
  const hints: CoverageHint[] = [];
  if (inkArea > 0 && colorCount === 0) hints.push('NO_PANTONE_COLORS');
  if (inkArea > 0 && poorMatchArea / inkArea > rules.poorMatchHintShare) hints.push('POOR_COLOR_MATCH');

  return {
    sheetArea,
    inkArea,
    sheetRatio: ratio(inkArea),
    colors: pantoneColors.map((color, i) => ({
      code: color.code,
      hex: color.hex,
      area: colorAreas[i],
      sheetRatio: ratio(colorAreas[i]),
    })),
    unassignedArea,
    unassignedSheetRatio: ratio(unassignedArea),
    poorMatchArea,
    panels,
    hints,
  };
}
