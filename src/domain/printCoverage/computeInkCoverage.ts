// Ink coverage estimate (docs/SPEC.md §4d). Pure TS: works on plain RGBA arrays, no DOM.
//
// The artwork areas are sampled by `walkArtworkCells` (sampling.ts: wall rect of each sheet column, plus its bottom
// allowance when the placement has `extendToBottom`, SPEC §4f — never the glue flap or the bleed; same UV mapping as
// the previews). The pixel under each cell is classified once (memoised per pixel):
// - alpha < minAlpha → no ink; otherwise ink weighted by alpha;
// - WHITE paper: a pixel within `nearWhiteDeltaE` of white is paper, not ink; BROWN paper: white is (white) ink;
// - an inked pixel goes to the Pantone whose preview colour is nearest in CIELAB (CIE76 ΔE);
//   with an empty Pantone list the ink stays unassigned.

import { PRINT_COVERAGE_RULES } from '../config/productCatalog';
import type { PantoneColor, PanelPosition, PaperColor } from '../types';
import { deltaE76, hexToRgb, rgbToLab, type Lab } from './color';
import { classifyInkPixel, walkArtworkCells, type PixelSample, type SamplingInput } from './sampling';

export type { CoveragePanelInput, PixelSample } from './sampling';

export type InkCoverageInput = SamplingInput & {
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

const NO_INK = -1;
const UNKNOWN = -2;

type Palette = { labs: Lab[]; count: number };

/** Per-pixel classification of one sample (memoised): Pantone index / NO_INK, alpha weight, poor-match flag. */
function createClassifier(sample: PixelSample, palette: Palette, paperColor: PaperColor, rules: InkCoverageRules) {
  const size = sample.width * sample.height;
  const classes = new Int16Array(size).fill(UNKNOWN);
  const weights = new Float32Array(size);
  const poor = new Uint8Array(size);

  const classify = (index: number) => {
    const ink = classifyInkPixel(sample.data, index, paperColor, rules);
    if (!ink) {
      classes[index] = NO_INK;
      return;
    }
    weights[index] = ink.weight;
    if (palette.count === 0) {
      classes[index] = 0; // unassigned bucket
      return;
    }
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < palette.count; i++) {
      const distance = deltaE76(ink.lab, palette.labs[i]);
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
  const panelOf = (position: PanelPosition) =>
    panels[position] ??
    (panels[position] = { wallArea: 0, printArea: 0, inkArea: 0, colorAreas: new Array<number>(colorCount).fill(0), unassignedArea: 0 });
  const classifiers = new Map<PixelSample, ReturnType<typeof createClassifier>>();

  walkArtworkCells(input, rules.gridCellsLongSide, {
    onSegment: (position, wallArea, printArea) => {
      const panel = panelOf(position);
      panel.wallArea += wallArea;
      panel.printArea = (panel.printArea ?? 0) + printArea;
    },
    onCell: (position, sample, index, cellArea) => {
      let classifier = classifiers.get(sample);
      if (!classifier) {
        classifier = createClassifier(sample, palette, paperColor, rules);
        classifiers.set(sample, classifier);
      }
      const { classes, weights, poor, classify } = classifier;
      if (classes[index] === UNKNOWN) classify(index);
      const klass = classes[index];
      if (klass === NO_INK) return;
      const panel = panelOf(position);
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
    },
  });

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
