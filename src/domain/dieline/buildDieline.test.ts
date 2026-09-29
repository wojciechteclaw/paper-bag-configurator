import { describe, expect, it } from 'vitest';
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

describe('buildDieline — PRODUCTION.md §9.6 example (W 200, H 400, D 150, s 20)', () => {
  const dieline = build();

  it('has a 720 × 490 mm sheet with a = 90 and the bottom line at y = a', () => {
    expect(dieline.sheet).toEqual({ width: 720, height: 490 });
    expect(dieline.allowance).toBe(90);
    expect(dieline.bottomLineY).toBe(90);
    expect(dieline.glueFlapWidth).toBe(20);
  });

  it('lays out BACK/2 | LEFT | FRONT | RIGHT | BACK/2 | glue flap', () => {
    expect(dieline.segments.map((s) => [s.id, s.panel, s.x0, s.x1, s.localX0])).toEqual([
      ['BACK_B', 'BACK', 0, 100, 100],
      ['LEFT', 'LEFT', 100, 250, 0],
      ['FRONT', 'FRONT', 250, 450, 0],
      ['RIGHT', 'RIGHT', 450, 600, 0],
      ['BACK_A', 'BACK', 600, 700, 0],
    ]);
    expect(dieline.glueFlap).toEqual({ x: 700, y: 0, width: 20, height: 490 });
  });

  it('splits BACK into two halves that together cover the whole back wall', () => {
    const halves = dieline.segments.filter((s) => s.panel === 'BACK');
    const covered = halves.map((s) => [s.localX0, s.localX0 + s.x1 - s.x0]).sort((a, b) => a[0] - b[0]);
    expect(covered).toEqual([
      [0, 100],
      [100, 200],
    ]);
  });

  it('cuts only the sheet outline', () => {
    expect(dieline.cuts).toEqual([
      [
        { x: 0, y: 0 },
        { x: 720, y: 0 },
        { x: 720, y: 490 },
        { x: 0, y: 490 },
      ],
    ]);
  });

  it('places the creases C1–C8 as in §9.3', () => {
    expect(byCode(dieline, 'C1').map((l) => toDoc(dieline, l))).toEqual([[[0, 0], [720, 0]]]);
    expect(byCode(dieline, 'C2').map((l) => l.from.x)).toEqual([100, 250, 450, 600]);
    expect(byCode(dieline, 'C2').every((l) => l.from.y === 0 && l.to.y === 490)).toBe(true);
    expect(byCode(dieline, 'C3').map((l) => [l.from.x, l.to.x])).toEqual([[700, 700]]);
    expect(byCode(dieline, 'C4').map((l) => toDoc(dieline, l))).toEqual([
      [[175, 75], [175, 400]],
      [[525, 75], [525, 400]],
    ]);
    expect(byCode(dieline, 'C5').map((l) => toDoc(dieline, l))).toEqual([
      [[175, -90], [175, -75]],
      [[525, -90], [525, -75]],
    ]);
    expect(byCode(dieline, 'C6').map((l) => toDoc(dieline, l))).toEqual([
      [[100, 0], [175, 75]],
      [[250, 0], [175, 75]],
      [[450, 0], [525, 75]],
      [[600, 0], [525, 75]],
    ]);
    expect(byCode(dieline, 'C7').map((l) => toDoc(dieline, l))).toEqual([
      [[100, 0], [175, -75]],
      [[250, 0], [175, -75]],
      [[450, 0], [525, -75]],
      [[600, 0], [525, -75]],
    ]);
    // Flat-fold crease: BACK_B + back half of LEFT, back half of RIGHT + BACK_A + glue flap.
    expect(byCode(dieline, 'C8').map((l) => toDoc(dieline, l))).toEqual([
      [[0, 75], [175, 75]],
      [[525, 75], [720, 75]],
    ]);
  });

  it('scores the horizontal flat-fold crease at sheet y = a + D/2 = 165 over both BACK halves and the back halves of the sides', () => {
    const c8 = byCode(dieline, 'C8');
    expect(c8.every((l) => l.from.y === 165 && l.to.y === 165)).toBe(true);
    const covers = (x0: number, x1: number) => c8.some((l) => Math.min(l.from.x, l.to.x) <= x0 && Math.max(l.from.x, l.to.x) >= x1);
    expect(covers(0, 100)).toBe(true); // BACK_B
    expect(covers(100, 175)).toBe(true); // LEFT, back edge → apex
    expect(covers(525, 600)).toBe(true); // RIGHT, apex → back edge
    expect(covers(600, 700)).toBe(true); // BACK_A
    // Never on FRONT or the front halves of the sides.
    expect(c8.some((l) => Math.max(l.from.x, l.to.x) > 175 && Math.min(l.from.x, l.to.x) < 525)).toBe(false);
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

  it('is mirror-symmetric around the FRONT centre for the tube part', () => {
    const axis = seg(dieline, 'FRONT').x0 + 100; // 350
    const key = (x: number, y: number) => `${Math.round(x * 1000)}:${Math.round(y * 1000)}`;
    const lines = dieline.creases.filter((l) => ['C2', 'C4', 'C5', 'C6', 'C7'].includes(l.code));
    const set = new Set(lines.map((l) => [key(l.from.x, l.from.y), key(l.to.x, l.to.y)].sort().join('|')));
    for (const l of lines) {
      const mirrored = [key(2 * axis - l.from.x, l.from.y), key(2 * axis - l.to.x, l.to.y)].sort().join('|');
      expect(set.has(mirrored)).toBe(true);
    }
  });

  it('marks bleed, safety, bottom allowance and bottom-flap glue zones', () => {
    const zone = (id: string) => dieline.zones.find((z) => z.id === id)!;
    expect(zone('bleed').rect).toEqual({ x: -3, y: -3, width: 703, height: 496 });
    expect(zone('bottom-allowance').rect).toEqual({ x: 0, y: 0, width: 700, height: 90 });
    expect(zone('glue-flap').rect).toEqual(dieline.glueFlap);
    expect(zone('bottom-flap-glue-FRONT').rect).toEqual({ x: 250, y: 0, width: 200, height: 30 });
    expect(zone('safety-FRONT').rect).toEqual({ x: 255, y: 96, width: 190, height: 388 });
    // Sides: critical content above the rhombus, y ≥ D/2 + 5.
    expect(zone('safety-LEFT').rect).toEqual({ x: 105, y: 90 + 80, width: 140, height: 484 - 170 });
  });

  it('annotates W, D, H, the allowance, the glue flap and the sheet size', () => {
    const values = Object.fromEntries(dieline.annotations.map((a) => [a.key, a.value]));
    expect(values).toEqual({
      width: 200,
      depth: 150,
      height: 400,
      allowance: 90,
      glueFlap: 20,
      sheetWidth: 720,
      sheetHeight: 490,
    });
  });

  it('labels every panel column and the glue flap', () => {
    const keys = dieline.labels.map((l) => l.key);
    expect(keys.filter((k) => k === 'BACK')).toHaveLength(2);
    expect(keys).toEqual(expect.arrayContaining(['FRONT', 'LEFT', 'RIGHT', 'glueFlap', 'frontFlap', 'backFlap', 'sideFlap']));
  });

  it('has no handle patches without a handle', () => {
    expect(dieline.handlePatches).toEqual([]);
  });
});

describe('buildDieline — handle patches (§9.5)', () => {
  it('uses the production fallback Lp = min(170, W − 20), Hp = 45, 3 mm below the top', () => {
    const handle = { ...createHandle('TWISTED_PAPER'), patch: undefined };
    const dieline = build(example, handle);
    const rects = Object.fromEntries(dieline.handlePatches.map((p) => [p.id, p.rect]));
    const docY = (y: number) => y - dieline.bottomLineY;
    expect(rects['patch-FRONT']).toMatchObject({ x: 265, width: 170, height: 45 });
    expect(docY(rects['patch-FRONT'].y)).toBe(352);
    // BACK patch is centred on the seam → split into [0, 85] and [615, 700].
    expect(rects['patch-BACK_B']).toMatchObject({ x: 0, width: 85 });
    expect(rects['patch-BACK_A']).toMatchObject({ x: 615, width: 85 });
  });

  it('uses the patch of the handle entity when it has one', () => {
    const handle = { ...createHandle('FLAT_PAPER'), patch: { width: 80, height: 50 } };
    const dieline = build(example, handle);
    const front = dieline.handlePatches.find((p) => p.id === 'patch-FRONT')!;
    expect(front.rect).toMatchObject({ x: 310, width: 80, height: 50, y: 490 - 3 - 50 });
  });

  it('keeps the BACK patch in one piece when the seam is moved off-centre', () => {
    const handle = { ...createHandle('FLAT_PAPER'), patch: { width: 80, height: 50 } };
    const dieline = buildDieline({ dimensions: example, handle }, { seamOffset: 20 });
    const back = dieline.handlePatches.filter((p) => p.panel === 'BACK');
    expect(back).toHaveLength(1);
    expect(back[0].segment).toBe('BACK_B');
    // BACK_B shows panel x ∈ [20, 200] at sheet x ∈ [0, 180] → patch x ∈ [60, 140] → sheet [40, 120].
    expect(back[0].rect).toMatchObject({ x: 40, width: 80 });
  });
});

describe('buildDieline — other sizes and options', () => {
  it.each([
    { width: 75, height: 170, depth: 40 },
    { width: 260, height: 430, depth: 170 },
    { width: 150, height: 300, depth: 150 },
  ])('computes the sheet for %o', (dimensions) => {
    const dieline = build(dimensions);
    const a = (dimensions.depth + 30) / 2;
    expect(dieline.sheet.width).toBe(2 * dimensions.width + 2 * dimensions.depth + 20);
    expect(dieline.sheet.height).toBe(dimensions.height + a);
    for (const line of dieline.creases) {
      for (const point of [line.from, line.to]) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(dieline.sheet.width);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThanOrEqual(dieline.sheet.height);
      }
    }
  });

  it('clamps the glue flap into 15–25 mm', () => {
    expect(buildDieline({ dimensions: example, handle: null }, { glueFlapWidth: 5 }).glueFlapWidth).toBe(15);
    expect(buildDieline({ dimensions: example, handle: null }, { glueFlapWidth: 40 }).sheet.width).toBe(725);
  });

  it('maps between sheet and panel-local coordinates', () => {
    const dieline = build();
    const backA = seg(dieline, 'BACK_A');
    const backB = seg(dieline, 'BACK_B');
    expect(panelToSheet(backA, dieline.bottomLineY, { x: 0, y: 0 })).toEqual({ x: 600, y: 90 });
    expect(panelToSheet(backB, dieline.bottomLineY, { x: 200, y: 400 })).toEqual({ x: 100, y: 490 });
    expect(sheetToPanel(seg(dieline, 'LEFT'), dieline.bottomLineY, { x: 175, y: 165 })).toEqual({ x: 75, y: 75 });
  });

  it('extends the artwork clip area by bleed at the sheet edge and by the crease overprint elsewhere', () => {
    const dieline = build();
    expect(getArtworkClipRect(dieline, seg(dieline, 'BACK_B'))).toEqual({ x: -3, y: -3, width: 105, height: 496 });
    expect(getArtworkClipRect(dieline, seg(dieline, 'FRONT'))).toEqual({ x: 248, y: -3, width: 204, height: 496 });
  });
});
