// Dieline geometry of the block-bottom bag: one pure function, the single source of truth for the 2D preview,
// the SVG export and the PDF export (docs/SPEC.md §4b, docs/PRODUCTION.md §9).

import { DIELINE_RULES } from '../config/productionRules';
import { getBottomAllowance } from '../geometry/tube';
import type { BagConfiguration, Handle, PanelPosition } from '../types';
import type {
  Dieline,
  DielineDimension,
  DielineHandlePatch,
  DielineLabel,
  DielineLine,
  DielineSegment,
  DielineSegmentId,
  DielineZone,
  Point2,
  Rect,
} from './types';

export type DielineOptions = {
  /** Longitudinal glue flap width `s`, mm. Defaults to the client rule (10 mm); only for what-if previews/tests. */
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

/** Handle patch size: the handle entity's patch when set, otherwise the production fallback (§9.5). */
export function getHandlePatchSize(handle: Handle, width: number): { width: number; height: number } {
  const rules = DIELINE_RULES.handlePatch;
  const size = handle.patch ?? {
    width: Math.min(rules.maxLength, width - rules.sideClearance),
    height: rules.height,
  };
  return { width: clamp(size.width, 0, width), height: Math.max(0, size.height) };
}

export function buildDieline(
  configuration: Pick<BagConfiguration, 'dimensions' | 'handle'>,
  options: DielineOptions = {},
): Dieline {
  const { dimensions, handle } = configuration;
  const { width: W, height: H, depth: D } = dimensions;
  const rules = DIELINE_RULES;
  const a = getBottomAllowance(dimensions);
  const h = Math.min(D / 2, H);
  const s = Math.max(0, options.glueFlapWidth ?? rules.glueFlapWidth);

  const sheetWidth = 2 * W + 2 * D + s;
  const sheetHeight = H + a;
  const y0 = a; // bottom line (C1) in sheet coordinates
  const yTop = sheetHeight;

  // ——— Columns: LEFT | FRONT | RIGHT | BACK (+ glue flap); every panel whole, panel-local x runs with sheet x ———
  // Seen from outside, the perimeter LEFT → FRONT → RIGHT → BACK is continuous (§3.1), so every column starts at its
  // panel's x = 0. LEFT x = 0 is its BACK edge = the free sheet edge at x = 0, where the seam closes the tube.
  const columns: { id: DielineSegmentId; panel: PanelPosition; width: number }[] = [
    { id: 'LEFT', panel: 'LEFT', width: D },
    { id: 'FRONT', panel: 'FRONT', width: W },
    { id: 'RIGHT', panel: 'RIGHT', width: D },
    { id: 'BACK', panel: 'BACK', width: W },
  ];
  let cursor = 0;
  const segments: DielineSegment[] = columns.map(({ id, panel, width }) => {
    const x0 = cursor;
    cursor += width;
    return {
      id,
      panel,
      x0,
      x1: cursor,
      localX0: 0,
      wall: rect(x0, y0, cursor, yTop),
      allowance: rect(x0, 0, cursor, y0),
    };
  });
  const seg = (id: DielineSegmentId) => segments.find((segment) => segment.id === id)!;
  const tubeEnd = cursor; // = 2W + 2D: glue flap hinge on BACK's outer edge (the BACK/LEFT tube edge)
  const glueFlap = rect(tubeEnd, 0, sheetWidth, sheetHeight);

  // ——— Cut: the sheet outline (no bottom-flap slits, §9.3) ———
  const cuts = [[p(0, 0), p(sheetWidth, 0), p(sheetWidth, sheetHeight), p(0, sheetHeight)]];

  // ——— Creases ———
  const creases: DielineLine[] = [];
  const add = (code: DielineLine['code'], id: string, from: Point2, to: Point2) => {
    if (Math.hypot(to.x - from.x, to.y - from.y) > 1e-9) creases.push({ id, code, from, to });
  };
  add('C1', 'C1', p(0, y0), p(sheetWidth, y0));
  // Tube edges LEFT|FRONT, FRONT|RIGHT, RIGHT|BACK; the fourth one (BACK/LEFT) is the glue flap hinge C3.
  segments.slice(0, -1).forEach((segment, i) => add('C2', `C2-${i + 1}`, p(segment.x1, 0), p(segment.x1, yTop)));
  add('C3', 'C3', p(tubeEnd, 0), p(tubeEnd, yTop));

  for (const side of [seg('LEFT'), seg('RIGHT')]) {
    const xc = side.x0 + D / 2;
    const tag = side.id;
    add('C4', `C4-${tag}`, p(xc, y0 + h), p(xc, yTop));
    add('C5', `C5-${tag}`, p(xc, 0), p(xc, Math.max(0, y0 - D / 2)));
    add('C6', `C6-${tag}-1`, p(side.x0, y0), p(xc, y0 + h));
    add('C6', `C6-${tag}-2`, p(side.x1, y0), p(xc, y0 + h));
    add('C7', `C7-${tag}-1`, p(side.x0, y0), p(xc, y0 - D / 2));
    add('C7', `C7-${tag}-2`, p(side.x1, y0), p(xc, y0 - D / 2));
  }
  // The glue flap is glued to the inside of LEFT's strip x ∈ [0, s] and folds together with it, so LEFT's 45° rhombus
  // creases continue across the flap (flap distance t from C3 = LEFT x = t).
  const flapRun = Math.min(s, h, D / 2);
  add('C6', 'C6-GLUE', p(tubeEnd, y0), p(tubeEnd + flapRun, y0 + flapRun));
  add('C7', 'C7-GLUE', p(tubeEnd, y0), p(tubeEnd + flapRun, y0 - flapRun));
  // C8 flat-fold crease y = D/2 on the whole BACK and on the halves of the sides adjacent to BACK: LEFT x ∈ [0, D/2]
  // at the start of the sheet; RIGHT x ∈ [D/2, D], BACK and the glue flap (lying on LEFT's back half) at the end.
  add('C8', 'C8-1', p(0, y0 + h), p(seg('LEFT').x0 + D / 2, y0 + h));
  add('C8', 'C8-2', p(seg('RIGHT').x0 + D / 2, y0 + h), p(sheetWidth, y0 + h));

  // ——— Zones ———
  const zones: DielineZone[] = [];
  const bleed = rules.bleed;
  zones.push({ id: 'bleed', kind: 'BLEED', rect: rect(-bleed, -bleed, tubeEnd, sheetHeight + bleed) });
  zones.push({ id: 'bottom-allowance', kind: 'BOTTOM_ALLOWANCE', rect: rect(0, 0, tubeEnd, y0) });
  zones.push({ id: 'glue-flap', kind: 'GLUE_FLAP', rect: glueFlap });
  for (const id of ['FRONT', 'BACK'] as const) {
    const segment = seg(id);
    zones.push({
      id: `bottom-flap-glue-${id}`,
      kind: 'BOTTOM_FLAP_GLUE',
      rect: rect(segment.x0, 0, segment.x1, Math.min(rules.bottomFlapGlue, y0)),
    });
  }
  for (const segment of segments) {
    const inset = rules.safetyFromCreases;
    const bottom =
      segment.panel === 'LEFT' || segment.panel === 'RIGHT'
        ? y0 + D / 2 + rules.sideSafetyAboveRhombus
        : y0 + rules.safetyFromTopAndBottom;
    const top = yTop - rules.safetyFromTopAndBottom;
    const x0 = segment.x0 + inset;
    const x1 = segment.x1 - inset;
    if (x1 > x0 && top > bottom) {
      zones.push({ id: `safety-${segment.id}`, kind: 'SAFETY', rect: rect(x0, bottom, x1, top) });
    }
  }

  // ——— Handle patches (inside FRONT and BACK, centred, drawn dashed) ———
  const handlePatches: DielineHandlePatch[] = [];
  if (handle) {
    const patch = getHandlePatchSize(handle, W);
    const top = yTop - rules.handlePatch.topOffset;
    const bottom = top - patch.height;
    for (const id of ['FRONT', 'BACK'] as const) {
      const segment = seg(id);
      const cx = (segment.x0 + segment.x1) / 2;
      handlePatches.push({
        id: `patch-${id}`,
        panel: id,
        segment: id,
        rect: rect(cx - patch.width / 2, bottom, cx + patch.width / 2, top),
      });
    }
  }

  // ——— Dimension annotations (outside the sheet: top and left) ———
  const front = seg('FRONT');
  const left = seg('LEFT');
  const annotations: DielineDimension[] = [
    { id: 'dim-width', key: 'width', from: p(front.x0, yTop), to: p(front.x1, yTop), value: W, side: 'top', offset: 10 },
    { id: 'dim-depth', key: 'depth', from: p(left.x0, yTop), to: p(left.x1, yTop), value: D, side: 'top', offset: 10 },
    { id: 'dim-glue', key: 'glueFlap', from: p(tubeEnd, yTop), to: p(sheetWidth, yTop), value: s, side: 'top', offset: 10 },
    { id: 'dim-sheet-width', key: 'sheetWidth', from: p(0, yTop), to: p(sheetWidth, yTop), value: sheetWidth, side: 'top', offset: 22 },
    { id: 'dim-height', key: 'height', from: p(0, y0), to: p(0, yTop), value: H, side: 'left', offset: 10 },
    { id: 'dim-allowance', key: 'allowance', from: p(0, 0), to: p(0, y0), value: a, side: 'left', offset: 10 },
    { id: 'dim-sheet-height', key: 'sheetHeight', from: p(0, 0), to: p(0, yTop), value: sheetHeight, side: 'left', offset: 22 },
  ];

  // ——— Labels ———
  const labelSize = clamp(Math.min(W, H) / 12, 6, 16);
  const labels: DielineLabel[] = [];
  for (const segment of segments) {
    const cx = (segment.x0 + segment.x1) / 2;
    const size = Math.min(labelSize, (segment.x1 - segment.x0) / 5);
    labels.push({ id: `label-${segment.id}`, key: segment.panel, at: p(cx, y0 + H * 0.6), size });
    const flapKey = segment.panel === 'FRONT' ? 'frontFlap' : segment.panel === 'BACK' ? 'backFlap' : 'sideFlap';
    labels.push({ id: `label-flap-${segment.id}`, key: flapKey, at: p(cx, y0 - a * 0.25), size: Math.min(size, a / 5) * 0.75 });
  }
  labels.push({ id: 'label-glue', key: 'glueFlap', at: p(tubeEnd + s / 2, y0 + H / 2), size: Math.min(labelSize, s * 0.45) });

  return {
    dimensions: { ...dimensions },
    allowance: a,
    glueFlapWidth: s,
    seamOffset: W,
    sheet: { width: sheetWidth, height: sheetHeight },
    bottomLineY: y0,
    segments,
    glueFlap,
    cuts,
    creases,
    zones,
    handlePatches,
    annotations,
    labels,
  };
}

/** Sheet → panel-local mm for a column (inverse: `panelToSheet`). */
export function sheetToPanel(segment: DielineSegment, bottomLineY: number, point: Point2): Point2 {
  return { x: point.x - segment.x0 + segment.localX0, y: point.y - bottomLineY };
}

/** Panel-local mm → sheet mm for a column. */
export function panelToSheet(segment: DielineSegment, bottomLineY: number, point: Point2): Point2 {
  return { x: point.x + segment.x0 - segment.localX0, y: point.y + bottomLineY };
}

/**
 * Artwork clip area of a column in sheet mm: the wall and its bottom allowance, extended by the crease overprint
 * towards neighbouring panels and by the bleed beyond the cut (top, tube end, left sheet edge = LEFT's free edge).
 * BACK's right edge gets only the overprint: the glue flap beyond it stays unprinted (§9.4).
 */
export function getArtworkClipRect(dieline: Dieline, segment: DielineSegment): Rect {
  const { bleed, creaseOverprint } = DIELINE_RULES;
  const left = segment.x0 <= 0 ? bleed : creaseOverprint;
  return rect(
    segment.x0 - left,
    -bleed,
    segment.x1 + creaseOverprint,
    dieline.sheet.height + bleed,
  );
}
