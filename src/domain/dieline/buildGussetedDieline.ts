// Dieline of the gusseted-bag bag with a fold-over bottom ("torba fałdowa", docs/PRODUCTION.md §13.4). Client guideline
// "Torba fałdowa – wytyczne techniczne" (30.09.2026) [K]. Same data model and sheet conventions as the block-bottom
// dieline (`buildDieline`, types.ts): sheet y = 0 at the tube end, bottom line at y = d, panel-local x of every column
// runs with sheet x (seen from outside).
//
// Blank B × L = (2W + 2F + s) × (H + d). Column order as the block-bottom bag [K] (client decision 30.09.2026, the
// guideline's "seam on the gusset edge" variant; the seam in the middle of BACK is not used): LEFT | FRONT | RIGHT |
// BACK | seam flap s, every wall whole. The seam lies on the BACK / LEFT tube edge: the flap hinges on BACK's outer
// edge and is glued to the inside of LEFT's free edge (sheet x = 0, LEFT's half next to BACK). The vertical creases
// from the left sheet edge follow F/2, F/2, W, F/2, F/2, W, s. Example 140 + 90 × 370, s = 15, d = 25 → 475 × 395 mm,
// creases at x = 45, 90, 230, 275, 320, 460.
//
// Creases: the three inner tube edges C2 fold out (VALLEY seen from the print side) and the gusset centres C4 fold in
// (MOUNTAIN) [K], over the whole length (the flattened tube is folded along them including the bottom strip); C3 = the
// seam-flap hinge on the fourth tube edge (BACK / LEFT, VALLEY). The bottom strip d (all layers, gussets included) is
// folded 180° TO THE BACK and glued [K], so the bottom line C1's direction depends on which way each layer's print side
// faces in the flat tube: BACK and the gusset halves next to FRONT face the BACK side → MOUNTAIN (print side inside
// the fold); FRONT, the gusset halves next to BACK and the seam flap (turned over at C3 onto the inside of LEFT's half
// next to BACK, its print side towards FRONT) → VALLEY. No 45° creases, no bottom flaps.

import { getGlueFlapWidth } from '../glueFlap';
import { DIELINE_RULES } from '../config/productionRules';
import { getBottomFoldDepth } from '../geometry/gussetedBag';
import type { BagConfiguration, PanelPosition } from '../types';
import type {
  CreaseCode,
  CreaseFold,
  Dieline,
  DielineDimension,
  DielineLabel,
  DielineLine,
  DielineSegment,
  DielineSegmentId,
  DielineZone,
  Point2,
  Rect,
} from './types';

export type GussetedDielineOptions = {
  /** Seam overlap `s`, mm, overriding the bag's glue flap (`getGlueFlapWidth`); for what-if previews/tests. */
  glueFlapWidth?: number;
};

const p = (x: number, y: number): Point2 => ({ x, y });
const rect = (x0: number, y0: number, x1: number, y1: number): Rect => ({
  x: Math.min(x0, x1),
  y: Math.min(y0, y1),
  width: Math.abs(x1 - x0),
  height: Math.abs(y1 - y0),
});
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Fold direction of the bottom line C1 on each part of the sheet, seen from the print side (the strip folds to the
 * BACK, see the file comment). Gusset halves in panel-local x: LEFT x ∈ [0, F/2] lies next to BACK, RIGHT x ∈ [0, F/2]
 * next to FRONT. The seam flap lies against the inside of LEFT's half next to BACK, print side towards FRONT.
 */
export const GUSSETED_BOTTOM_FOLD: Readonly<{
  FRONT: CreaseFold;
  BACK: CreaseFold;
  GUSSET_NEXT_TO_FRONT: CreaseFold;
  GUSSET_NEXT_TO_BACK: CreaseFold;
  GLUE_FLAP: CreaseFold;
}> = {
  FRONT: 'VALLEY',
  BACK: 'MOUNTAIN',
  GUSSET_NEXT_TO_FRONT: 'MOUNTAIN',
  GUSSET_NEXT_TO_BACK: 'VALLEY',
  GLUE_FLAP: 'VALLEY',
};

export function buildGussetedDieline(
  configuration: Pick<BagConfiguration, 'dimensions'> & Partial<Pick<BagConfiguration, 'glueFlapWidth'>>,
  options: GussetedDielineOptions = {},
): Dieline {
  const { dimensions } = configuration;
  const { width: W, height: H, depth: F } = dimensions;
  const rules = DIELINE_RULES;
  const d = getBottomFoldDepth(dimensions);
  const s = Math.max(0, options.glueFlapWidth ?? getGlueFlapWidth({ glueFlapWidth: configuration.glueFlapWidth, productType: 'FOLDED' }));

  const sheetWidth = 2 * W + 2 * F + s;
  const sheetHeight = H + d;
  const y0 = d; // bottom line (C1) in sheet coordinates
  const yTop = sheetHeight;

  // ——— Columns: LEFT | FRONT | RIGHT | BACK like the block bottom; every wall whole, panel-local x runs with sheet x ———
  const columns: { id: DielineSegmentId; panel: PanelPosition; width: number }[] = [
    { id: 'LEFT', panel: 'LEFT', width: F },
    { id: 'FRONT', panel: 'FRONT', width: W },
    { id: 'RIGHT', panel: 'RIGHT', width: F },
    { id: 'BACK', panel: 'BACK', width: W },
  ];
  let cursor = 0;
  const segments: DielineSegment[] = columns.map(({ id, panel, width }) => {
    const x0 = cursor;
    cursor += width;
    return { id, panel, x0, x1: cursor, localX0: 0, wall: rect(x0, y0, cursor, yTop), allowance: rect(x0, 0, cursor, y0) };
  });
  const seg = (id: DielineSegmentId) => segments.find((segment) => segment.id === id)!;
  const tubeEnd = cursor; // 2W + 2F: seam flap hinge on BACK's outer edge (the BACK / LEFT tube edge)
  const glueFlap = rect(tubeEnd, 0, sheetWidth, sheetHeight);

  // ——— Cut: plain rectangle; the seam flap runs through the bottom fold, so its ends stay square [Z] ———
  const cuts = [[p(0, 0), p(sheetWidth, 0), p(sheetWidth, sheetHeight), p(0, sheetHeight)]];

  // ——— Creases ———
  const creases: DielineLine[] = [];
  const add = (code: CreaseCode, id: string, from: Point2, to: Point2, kind: CreaseFold) => {
    if (Math.hypot(to.x - from.x, to.y - from.y) > 1e-9) creases.push({ id, code, kind, from, to });
  };
  const fold = GUSSETED_BOTTOM_FOLD;
  const left = seg('LEFT');
  const right = seg('RIGHT');
  const c1 = (id: string, x0: number, x1: number, kind: CreaseFold) => add('C1', `C1-${id}`, p(x0, y0), p(x1, y0), kind);
  c1('LEFT-1', left.x0, left.x0 + F / 2, fold.GUSSET_NEXT_TO_BACK);
  c1('LEFT-2', left.x0 + F / 2, left.x1, fold.GUSSET_NEXT_TO_FRONT);
  c1('FRONT', seg('FRONT').x0, seg('FRONT').x1, fold.FRONT);
  c1('RIGHT-1', right.x0, right.x0 + F / 2, fold.GUSSET_NEXT_TO_FRONT);
  c1('RIGHT-2', right.x0 + F / 2, right.x1, fold.GUSSET_NEXT_TO_BACK);
  c1('BACK', right.x1, tubeEnd, fold.BACK);
  c1('GLUE', tubeEnd, sheetWidth, fold.GLUE_FLAP);
  // Tube edges LEFT|FRONT, FRONT|RIGHT, RIGHT|BACK (fold out) and the seam-flap hinge on the BACK|LEFT tube edge.
  [left.x1, right.x0, right.x1].forEach((x, i) => add('C2', `C2-${i + 1}`, p(x, 0), p(x, yTop), 'VALLEY'));
  add('C3', 'C3', p(tubeEnd, 0), p(tubeEnd, yTop), 'VALLEY');
  for (const side of [left, right]) {
    add('C4', `C4-${side.id}`, p(side.x0 + F / 2, 0), p(side.x0 + F / 2, yTop), 'MOUNTAIN');
  }

  // ——— Zones ———
  const bleed = rules.bleed;
  const zones: DielineZone[] = [
    { id: 'bleed', kind: 'BLEED', rect: rect(-bleed, -bleed, tubeEnd, sheetHeight + bleed) },
    { id: 'bottom-allowance', kind: 'BOTTOM_ALLOWANCE', rect: rect(0, 0, tubeEnd, y0) },
    { id: 'glue-flap', kind: 'GLUE_FLAP', rect: glueFlap },
    // Glue on the bottom strip d [K]; the strip folds to the BACK, so the glue lies on the print side of BACK's strip,
    // which meets the print side of the BACK wall.
    { id: 'bottom-flap-glue-BACK', kind: 'BOTTOM_FLAP_GLUE', face: 'PRINT', rect: seg('BACK').allowance },
  ];
  // Safety areas: the print area is W × (H − d) per side [K] (the band y ∈ [0, d] above the bottom line is under the
  // folded strip on BACK and inside the glued, closed bottom elsewhere), clear of creases, the seam and the top cut.
  const inset = rules.safetyFromCreases;
  const top = yTop - rules.safetyFromTopAndBottom;
  const bottom = y0 + d + rules.safetyFromTopAndBottom;
  const safety = (id: string, x0: number, x1: number) => {
    if (x1 - inset > x0 + inset && top > bottom) zones.push({ id, kind: 'SAFETY', rect: rect(x0 + inset, bottom, x1 - inset, top) });
  };
  for (const segment of segments) {
    if (segment.panel === 'LEFT' || segment.panel === 'RIGHT') {
      const xc = segment.x0 + F / 2;
      safety(`safety-${segment.id}-1`, segment.x0, xc);
      safety(`safety-${segment.id}-2`, xc, segment.x1);
    } else {
      safety(`safety-${segment.id}`, segment.x0, segment.x1);
    }
  }

  // ——— Dimension annotations (outside the sheet: top and left) ———
  const front = seg('FRONT');
  const annotations: DielineDimension[] = [
    { id: 'dim-width', key: 'width', from: p(front.x0, yTop), to: p(front.x1, yTop), value: W, side: 'top', offset: 10 },
    { id: 'dim-depth', key: 'depth', from: p(left.x0, yTop), to: p(left.x1, yTop), value: F, side: 'top', offset: 10 },
    { id: 'dim-glue', key: 'glueFlap', from: p(tubeEnd, yTop), to: p(sheetWidth, yTop), value: s, side: 'top', offset: 10 },
    { id: 'dim-sheet-width', key: 'sheetWidth', from: p(0, yTop), to: p(sheetWidth, yTop), value: sheetWidth, side: 'top', offset: 22 },
    { id: 'dim-height', key: 'height', from: p(0, y0), to: p(0, yTop), value: H, side: 'left', offset: 10 },
    { id: 'dim-allowance', key: 'allowance', from: p(0, 0), to: p(0, y0), value: d, side: 'left', offset: 10 },
    { id: 'dim-sheet-height', key: 'sheetHeight', from: p(0, 0), to: p(0, yTop), value: sheetHeight, side: 'left', offset: 22 },
  ];

  // ——— Labels (panel names; the glue flap label is kept for parity with the block bottom) ———
  const labelSize = clamp(Math.min(W, H) / 12, 6, 16);
  const labels: DielineLabel[] = segments.map((segment) => ({
    id: `label-${segment.id}`,
    key: segment.panel,
    at: p((segment.x0 + segment.x1) / 2, y0 + H * 0.6),
    size: Math.min(labelSize, (segment.x1 - segment.x0) / 5),
  }));
  labels.push({ id: 'label-glue', key: 'glueFlap', at: p(tubeEnd + s / 2, y0 + H / 2), size: Math.min(labelSize, s * 0.45) });

  return {
    dimensions: { ...dimensions },
    allowance: d,
    glueFlapWidth: s,
    seamOffset: W,
    sheet: { width: sheetWidth, height: sheetHeight },
    bottomLineY: y0,
    segments,
    glueFlap,
    cuts,
    creases,
    zones,
    handlePatches: [],
    annotations,
    labels,
  };
}
