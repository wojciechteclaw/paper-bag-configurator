import { describe, expect, it } from 'vitest';
import { DIELINE_RULES } from '../config/productionRules';
import { createHandle } from '../factories';
import type { Dimensions, Handle } from '../types';
import { buildDieline, getArtworkClipRect, panelToSheet, sheetToPanel } from './buildDieline';
import type { Dieline, DielineLine } from './types';

const example: Dimensions = { width: 200, height: 400, depth: 150 };
const build = (dimensions: Dimensions = example, handle: Handle | null = null) => buildDieline({ dimensions, handle });
const byCode = (dieline: Dieline, code: DielineLine['code']) => dieline.creases.filter((c) => c.code === code);
const seg = (dieline: Dieline, id: string) => dieline.segments.find((s) => s.id === id)!;
/** Converts sheet coordinates to PRODUCTION.md coordinates (Y = 0 at the bottom line). */
const toDoc = (dieline: Dieline, line: DielineLine) => [
  [line.from.x, line.from.y - dieline.bottomLineY],
  [line.to.x, line.to.y - dieline.bottomLineY],
];

describe('production rules - longitudinal seam (client rule)', () => {
  it('uses a 10 mm glue flap with the seam on the BACK/LEFT tube edge', () => {
    expect(DIELINE_RULES.glueFlapWidth).toBe(10);
    expect(DIELINE_RULES.seam).toBe('BACK_LEFT');
  });
});

describe('buildDieline - PRODUCTION.md §9.6 example (W 200, H 400, D 150, s 10)', () => {
  const dieline = build();

  it('has a 710 × 490 mm sheet with a = 90 and the bottom line at y = a', () => {
    expect(dieline.sheet).toEqual({ width: 710, height: 490 });
    expect(dieline.allowance).toBe(90);
    expect(dieline.bottomLineY).toBe(90);
    expect(dieline.glueFlapWidth).toBe(10);
    expect(dieline.seamOffset).toBe(200); // BACK x = W: the BACK/LEFT edge
  });

  it('lays out LEFT | FRONT | RIGHT | BACK | glue flap, every panel whole', () => {
    expect(dieline.segments.map((s) => [s.id, s.panel, s.x0, s.x1, s.localX0])).toEqual([
      ['LEFT', 'LEFT', 0, 150, 0],
      ['FRONT', 'FRONT', 150, 350, 0],
      ['RIGHT', 'RIGHT', 350, 500, 0],
      ['BACK', 'BACK', 500, 700, 0],
    ]);
    // The flap hinges on BACK's outer edge (x = 2W + 2D) at the right end of the sheet.
    expect(dieline.glueFlap).toEqual({ x: 700, y: 0, width: 10, height: 490 });
  });

  it('does not split BACK', () => {
    expect(dieline.segments.filter((s) => s.panel === 'BACK')).toHaveLength(1);
    expect(seg(dieline, 'BACK').x1 - seg(dieline, 'BACK').x0).toBe(200);
  });

  it('cuts only the sheet outline', () => {
    expect(dieline.cuts).toEqual([
      [
        { x: 0, y: 0 },
        { x: 710, y: 0 },
        { x: 710, y: 490 },
        { x: 0, y: 490 },
      ],
    ]);
  });

  it('places the creases C1–C8 as in §9.3', () => {
    expect(byCode(dieline, 'C1').map((l) => toDoc(dieline, l))).toEqual([[[0, 0], [710, 0]]]);
    expect(byCode(dieline, 'C2').map((l) => l.from.x)).toEqual([150, 350, 500]);
    expect(byCode(dieline, 'C2').every((l) => l.from.y === 0 && l.to.y === 490)).toBe(true);
    expect(byCode(dieline, 'C3').map((l) => [l.from.x, l.to.x])).toEqual([[700, 700]]);
    expect(byCode(dieline, 'C4').map((l) => toDoc(dieline, l))).toEqual([
      [[75, 75], [75, 400]],
      [[425, 75], [425, 400]],
    ]);
    expect(byCode(dieline, 'C5').map((l) => toDoc(dieline, l))).toEqual([
      [[75, -90], [75, -75]],
      [[425, -90], [425, -75]],
    ]);
    expect(byCode(dieline, 'C6').map((l) => toDoc(dieline, l))).toEqual([
      [[0, 0], [75, 75]],
      [[150, 0], [75, 75]],
      [[350, 0], [425, 75]],
      [[500, 0], [425, 75]],
      [[700, 0], [710, 10]], // continued across the glue flap laminated to LEFT x ∈ [0, 10]
    ]);
    expect(byCode(dieline, 'C7').map((l) => toDoc(dieline, l))).toEqual([
      [[0, 0], [75, -75]],
      [[150, 0], [75, -75]],
      [[350, 0], [425, -75]],
      [[500, 0], [425, -75]],
      [[700, 0], [710, -10]],
    ]);
    // Flat-fold crease: back half of LEFT (sheet start), back half of RIGHT + whole BACK + glue flap (sheet end).
    expect(byCode(dieline, 'C8').map((l) => toDoc(dieline, l))).toEqual([
      [[0, 75], [75, 75]],
      [[425, 75], [710, 75]],
    ]);
  });

  it('scores the flat-fold crease at y = a + D/2 = 165 over the whole BACK and the BACK-adjacent halves of the sides', () => {
    const c8 = byCode(dieline, 'C8');
    expect(c8.every((l) => l.from.y === 165 && l.to.y === 165)).toBe(true);
    const covers = (x0: number, x1: number) =>
      c8.some((l) => Math.min(l.from.x, l.to.x) <= x0 && Math.max(l.from.x, l.to.x) >= x1);
    expect(covers(0, 75)).toBe(true); // LEFT x ∈ [0, D/2]: x = 0 is LEFT's BACK edge
    expect(covers(425, 500)).toBe(true); // RIGHT x ∈ [D/2, D]: x = D is RIGHT's BACK edge
    expect(covers(500, 700)).toBe(true); // whole BACK
    expect(covers(700, 710)).toBe(true); // glue flap
    // Never on FRONT or the FRONT-adjacent halves of the sides.
    expect(c8.some((l) => Math.max(l.from.x, l.to.x) > 75 && Math.min(l.from.x, l.to.x) < 425)).toBe(false);
  });

  it('keeps every crease inside the sheet', () => {
    for (const line of dieline.creases) {
      for (const point of [line.from, line.to]) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(dieline.sheet.width);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThanOrEqual(dieline.sheet.height);
      }
    }
  });

  it('is mirror-symmetric around the FRONT centre along the tube perimeter (seam edge x = 0 same as x = 2W + 2D)', () => {
    const axis = seg(dieline, 'FRONT').x0 + 100; // 250
    const perimeter = 700_000; // µm
    const wrap = (x: number) => ((Math.round(x * 1000) % perimeter) + perimeter) % perimeter;
    const key = (x: number, y: number) => `${wrap(x)}:${Math.round(y * 1000)}`;
    const lineKey = (l: DielineLine, mirror: boolean) => {
      const m = (x: number) => (mirror ? 2 * axis - x : x);
      return [key(m(l.from.x), l.from.y), key(m(l.to.x), l.to.y)].sort().join('|');
    };
    const lines = dieline.creases.filter(
      (l) => ['C2', 'C3', 'C4', 'C5', 'C6', 'C7'].includes(l.code) && !l.id.endsWith('GLUE'),
    );
    const set = new Set(lines.map((l) => lineKey(l, false)));
    for (const l of lines) expect(set.has(lineKey(l, true))).toBe(true);
  });

  it('marks bleed, safety, bottom allowance and bottom-flap glue zones', () => {
    const zone = (id: string) => dieline.zones.find((z) => z.id === id)!;
    expect(zone('bleed').rect).toEqual({ x: -3, y: -3, width: 703, height: 496 });
    expect(zone('bottom-allowance').rect).toEqual({ x: 0, y: 0, width: 700, height: 90 });
    expect(zone('glue-flap').rect).toEqual(dieline.glueFlap);
    expect(zone('bottom-flap-glue-FRONT').rect).toEqual({ x: 150, y: 0, width: 200, height: 30 });
    expect(zone('bottom-flap-glue-BACK').rect).toEqual({ x: 500, y: 0, width: 200, height: 30 });
    expect(zone('safety-FRONT').rect).toEqual({ x: 155, y: 96, width: 190, height: 388 });
    expect(zone('safety-BACK').rect).toEqual({ x: 505, y: 96, width: 190, height: 388 });
    // Sides: critical content above the rhombus, y ≥ D/2 + 5.
    expect(zone('safety-LEFT').rect).toEqual({ x: 5, y: 90 + 80, width: 140, height: 484 - 170 });
  });

  it('annotates W, D, H, the allowance, the glue flap and the sheet size', () => {
    const values = Object.fromEntries(dieline.annotations.map((a) => [a.key, a.value]));
    expect(values).toEqual({
      width: 200,
      depth: 150,
      height: 400,
      allowance: 90,
      glueFlap: 10,
      sheetWidth: 710,
      sheetHeight: 490,
    });
    expect(dieline.annotations.find((a) => a.key === 'glueFlap')).toMatchObject({ from: { x: 700 }, to: { x: 710 } });
  });

  it('labels every panel column once and the glue flap', () => {
    const keys = dieline.labels.map((l) => l.key);
    for (const panel of ['FRONT', 'BACK', 'LEFT', 'RIGHT']) expect(keys.filter((k) => k === panel)).toHaveLength(1);
    expect(keys).toEqual(expect.arrayContaining(['glueFlap', 'frontFlap', 'backFlap', 'sideFlap']));
    expect(dieline.labels.find((l) => l.key === 'glueFlap')!.at.x).toBe(705);
  });

  it('has no handle patches without a handle', () => {
    expect(dieline.handlePatches).toEqual([]);
  });
});

describe('buildDieline - handle patches (§9.5)', () => {
  it.each([
    ['catalog default', createHandle('FLAT_PAPER')],
    ['no patch on the entity', { ...createHandle('TWISTED_PAPER'), patch: undefined }],
  ])('draws the 100 × 20 mm patch 20 mm below the top, centred on FRONT and BACK [K] (%s)', (_, handle) => {
    const dieline = build(example, handle);
    const rects = Object.fromEntries(dieline.handlePatches.map((p) => [p.id, p.rect]));
    const docY = (y: number) => y - dieline.bottomLineY;
    expect(Object.keys(rects)).toEqual(['patch-FRONT', 'patch-BACK']);
    // FRONT centre x = D + W/2 = 250; y ∈ [H − 40, H − 20] = [360, 380].
    expect(rects['patch-FRONT']).toMatchObject({ x: 200, width: 100, height: 20 });
    expect(docY(rects['patch-FRONT'].y)).toBe(360);
    // BACK is one piece → one patch, centred on BACK (x = 600).
    expect(rects['patch-BACK']).toMatchObject({ x: 550, width: 100, height: 20 });
  });

  it('uses the patch of the handle entity when it has one', () => {
    const handle = { ...createHandle('FLAT_PAPER'), patch: { width: 80, height: 50 } };
    const dieline = build(example, handle);
    const front = dieline.handlePatches.find((p) => p.id === 'patch-FRONT')!;
    const back = dieline.handlePatches.find((p) => p.id === 'patch-BACK')!;
    expect(front.rect).toMatchObject({ x: 210, width: 80, height: 50, y: 490 - 20 - 50 });
    expect(back).toMatchObject({ panel: 'BACK', segment: 'BACK', rect: { x: 560, width: 80 } });
  });

  it('keeps the patch 5 mm from the side creases on a narrow wall', () => {
    const dieline = build({ width: 75, height: 170, depth: 40 }, createHandle('TWISTED_PAPER'));
    expect(dieline.handlePatches.find((p) => p.id === 'patch-FRONT')!.rect).toMatchObject({ x: 45, width: 65 });
  });
});

describe('buildDieline - other sizes and options', () => {
  it.each([
    { width: 75, height: 170, depth: 40 },
    { width: 260, height: 430, depth: 170 },
    { width: 150, height: 300, depth: 150 },
  ])('computes the sheet for %o', (dimensions) => {
    const dieline = build(dimensions);
    const a = (dimensions.depth + 30) / 2;
    expect(dieline.sheet.width).toBe(2 * dimensions.width + 2 * dimensions.depth + 10);
    expect(dieline.sheet.height).toBe(dimensions.height + a);
    expect(dieline.glueFlap.x).toBe(2 * dimensions.width + 2 * dimensions.depth);
    for (const line of dieline.creases) {
      for (const point of [line.from, line.to]) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(dieline.sheet.width);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThanOrEqual(dieline.sheet.height);
      }
    }
  });

  it('defaults the glue flap to the client rule and accepts an override', () => {
    expect(build().glueFlapWidth).toBe(10);
    expect(buildDieline({ dimensions: example, handle: null }, { glueFlapWidth: 20 }).sheet.width).toBe(720);
    expect(buildDieline({ dimensions: example, handle: null }, { glueFlapWidth: -5 }).glueFlapWidth).toBe(0);
  });

  it('maps between sheet and panel-local coordinates', () => {
    const dieline = build();
    const back = seg(dieline, 'BACK');
    expect(panelToSheet(back, dieline.bottomLineY, { x: 0, y: 0 })).toEqual({ x: 500, y: 90 });
    expect(panelToSheet(back, dieline.bottomLineY, { x: 200, y: 400 })).toEqual({ x: 700, y: 490 });
    expect(sheetToPanel(seg(dieline, 'LEFT'), dieline.bottomLineY, { x: 75, y: 165 })).toEqual({ x: 75, y: 75 });
    expect(sheetToPanel(seg(dieline, 'RIGHT'), dieline.bottomLineY, { x: 350, y: 90 })).toEqual({ x: 0, y: 0 });
  });

  it('extends the artwork clip area by bleed at the sheet edge and by the crease overprint elsewhere (extended to the bottom)', () => {
    const dieline = build();
    expect(getArtworkClipRect(dieline, seg(dieline, 'LEFT'), true)).toEqual({ x: -3, y: -3, width: 155, height: 496 });
    expect(getArtworkClipRect(dieline, seg(dieline, 'FRONT'), true)).toEqual({ x: 148, y: -3, width: 204, height: 496 });
    expect(getArtworkClipRect(dieline, seg(dieline, 'BACK'), true)).toEqual({ x: 498, y: -3, width: 204, height: 496 });
  });

  it('clips the artwork to the wall (+ 2 mm overprint across the bottom line) without the extension', () => {
    const dieline = build();
    // a = 90: the wall starts at sheet y = 90, clip from 88 up to 490 + 3 bleed.
    expect(getArtworkClipRect(dieline, seg(dieline, 'FRONT'))).toEqual({ x: 148, y: 88, width: 204, height: 405 });
    expect(getArtworkClipRect(dieline, seg(dieline, 'LEFT'), false)).toEqual({ x: -3, y: 88, width: 155, height: 405 });
  });
});
