import { describe, expect, it } from 'vitest';
import { DIELINE_RULES } from '../config/productionRules';
import { createHandle } from '../factories';
import type { Dimensions, Handle } from '../types';
import { buildDieline, CREASE_FOLDS, getArtworkClipRect, panelToSheet, sheetToPanel, ZONE_CORNER_EDGE_FOLD } from './buildDieline';
import { polygonArea } from '../geometry/sideGusset';
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

  it('cuts only the sheet outline (no bottom-flap slits)', () => {
    expect(dieline.cuts).toHaveLength(1);
    const xs = dieline.cuts[0].map((q) => q.x);
    const ys = dieline.cuts[0].map((q) => q.y);
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([0, 710, 0, 490]);
  });

  it('places the creases as in §9.3 (client bottom model: 45° C9 on FRONT / BACK zones, none in the side zones)', () => {
    expect(byCode(dieline, 'C1').map((l) => toDoc(dieline, l))).toEqual([[[0, 0], [710, 0]]]);
    // Tube edges split at the bottom line: wall part and zone part (different fold direction).
    expect(byCode(dieline, 'C2').map((l) => toDoc(dieline, l))).toEqual([
      [[150, 0], [150, 400]],
      [[150, -90], [150, 0]],
      [[350, 0], [350, 400]],
      [[350, -90], [350, 0]],
      [[500, 0], [500, 400]],
      [[500, -90], [500, 0]],
    ]);
    expect(byCode(dieline, 'C3').map((l) => toDoc(dieline, l))).toEqual([
      [[700, 0], [700, 400]],
      [[700, -90], [700, 0]],
    ]);
    expect(byCode(dieline, 'C4').map((l) => toDoc(dieline, l))).toEqual([
      [[75, 75], [75, 400]],
      [[425, 75], [425, 400]],
    ]);
    expect(byCode(dieline, 'C6').map((l) => toDoc(dieline, l))).toEqual([
      [[0, 0], [75, 75]],
      [[150, 0], [75, 75]],
      [[350, 0], [425, 75]],
      [[500, 0], [425, 75]],
      [[700, 0], [710, 10]], // continued across the glue flap laminated to LEFT x ∈ [0, 10]
    ]);
    // FRONT / BACK zone diagonals for E = 90: (0,0)→(E,−E) and (W,0)→(W−E,−E) — trapezoid 200 → 20 mm.
    expect(byCode(dieline, 'C9').map((l) => toDoc(dieline, l))).toEqual([
      [[150, 0], [240, -90]],
      [[350, 0], [260, -90]],
      [[500, 0], [590, -90]],
      [[700, 0], [610, -90]],
    ]);
    // No diagonal (nor any other crease) inside the side zones: only the zone borders C1 / C2 / C3 touch them.
    for (const side of ['LEFT', 'RIGHT'] as const) {
      const { x0, x1 } = seg(dieline, side);
      const inside = dieline.creases.filter((l) =>
        [l.from, l.to].some((q) => q.x > x0 + 1e-9 && q.x < x1 - 1e-9 && q.y < dieline.bottomLineY - 1e-9),
      );
      expect(inside).toEqual([]);
    }
    expect(dieline.creases.some((l) => (l.code as string) === 'C5' || (l.code as string) === 'C7')).toBe(false);
    // Flat-fold crease: back half of LEFT (sheet start), back half of RIGHT + whole BACK + glue flap (sheet end).
    expect(byCode(dieline, 'C8').map((l) => toDoc(dieline, l))).toEqual([
      [[0, 75], [75, 75]],
      [[425, 75], [500, 75]],
      [[500, 75], [700, 75]],
      [[700, 75], [710, 75]],
    ]);
  });

  it('ends the C9 creases at the crossing for a narrow bag (W < D + 30: trapezoid → triangle, no NaN)', () => {
    const narrow = build({ width: 120, height: 300, depth: 110 }); // E = 70 > W/2 = 60
    const c9 = byCode(narrow, 'C9').map((l) => toDoc(narrow, l));
    expect(c9.slice(0, 2)).toEqual([
      [[110, 0], [170, -60]],
      [[230, 0], [170, -60]],
    ]);
    narrow.creases.forEach((l) => expect(Number.isFinite(l.from.x + l.from.y + l.to.x + l.to.y)).toBe(true));
  });

  it('classifies every crease as valley / mountain seen from the print side (client spec + C8 / zone-edge decisions)', () => {
    const kinds = (code: DielineLine['code']) => [...new Set(byCode(dieline, code).map((l) => l.kind))];
    expect(kinds('C1')).toEqual(['VALLEY']); // bottom line
    // Tube edges: VALLEY on the walls, MOUNTAIN in the bottom zone (the turned-over corner triangle meets the side flap
    // print side to print side, docs/PRODUCTION.md §9.3).
    for (const code of ['C2', 'C3'] as const) {
      for (const l of byCode(dieline, code)) {
        expect(l.kind, l.id).toBe(l.id.endsWith('-Z') ? ZONE_CORNER_EDGE_FOLD : 'VALLEY');
      }
    }
    expect(ZONE_CORNER_EDGE_FOLD).toBe('MOUNTAIN');
    expect(kinds('C4')).toEqual(['MOUNTAIN']); // gusset centre axis
    expect(kinds('C6')).toEqual(['MOUNTAIN']); // 45° flat-fold diagonals (spec line 5)
    expect(kinds('C9')).toEqual(['VALLEY']); // trapezoid diagonals: the corner triangle turns over onto the inside
    expect(byCode(dieline, 'C8').map((l) => [l.id, l.kind])).toEqual([
      ['C8-1', 'VALLEY'],
      ['C8-2', 'VALLEY'],
      ['C8-3', 'MOUNTAIN'],
      ['C8-4', 'VALLEY'],
    ]);
    expect(dieline.creases.every((l) => l.kind === 'VALLEY' || l.kind === 'MOUNTAIN')).toBe(true);
    for (const [code, kind] of Object.entries(CREASE_FOLDS)) {
      const walls = byCode(dieline, code as DielineLine['code']).filter((l) => !l.id.endsWith('-Z') && l.id !== 'C8-3');
      expect(walls.every((l) => l.kind === kind), code).toBe(true);
    }
  });

  it('makes the bottom corner vertices flat-foldable: Maekawa |M − V| = 2 and Kawasaki 180° / 180°', () => {
    const y0 = dieline.bottomLineY;
    for (const x of [150, 350, 500, 700]) {
      const at = (q: { x: number; y: number }) => Math.abs(q.x - x) < 1e-9 && Math.abs(q.y - y0) < 1e-9;
      const meeting = dieline.creases.filter((l) => at(l.from) || at(l.to) || (l.code === 'C1' && l.from.x < x && l.to.x > x));
      // C1 is one line through the vertex: count it twice (left and right ray).
      const rays = meeting.flatMap((l) => {
        const other = at(l.from) ? l.to : l.from;
        const onLine = l.code === 'C1';
        const dirs = onLine ? [Math.PI, 0] : [Math.atan2(other.y - y0, other.x - x)];
        return dirs.map((angle) => ({ angle, kind: l.kind, code: l.code }));
      });
      expect(rays.map((r) => r.code).sort(), `x = ${x}`).toEqual(['C1', 'C1', x === 700 ? 'C3' : 'C2', x === 700 ? 'C3' : 'C2', 'C6', 'C9']);
      const m = rays.filter((r) => r.kind === 'MOUNTAIN').length;
      expect(Math.abs(m - (rays.length - m)), `x = ${x}`).toBe(2);
      const sorted = rays.map((r) => (r.angle + 2 * Math.PI) % (2 * Math.PI)).sort((a, b) => a - b);
      const sectors = sorted.map((a, i) => ((sorted[(i + 1) % sorted.length] - a + 2 * Math.PI) % (2 * Math.PI)) || 2 * Math.PI);
      const alternate = sectors.filter((_, i) => i % 2 === 0).reduce((sum, a) => sum + a, 0);
      expect(alternate).toBeCloseTo(Math.PI, 9);
    }
  });

  it('chamfers both ends of the glue flap at 45° in the cut outline (client rule)', () => {
    expect(dieline.cuts).toHaveLength(1);
    expect(dieline.cuts[0].map((q) => [q.x, q.y])).toEqual([
      [0, 0],
      [700, 0],
      [710, 10],
      [710, 480],
      [700, 490],
      [0, 490],
    ]);
    const flap = dieline.zones.find((z) => z.id === 'glue-flap')!;
    expect(flap.rect).toEqual({ x: 700, y: 0, width: 10, height: 490 });
    expect(polygonArea(flap.polygon!)).toBeCloseTo(10 * (490 - 10)); // s · (sheetHeight − s)
    expect(dieline.sheet).toEqual({ width: 710, height: 490 });
  });

  it('makes the diamond apex flat-foldable: Maekawa |M − V| = 2 with C4, both C6 and the side C8', () => {
    for (const side of ['LEFT', 'RIGHT'] as const) {
      const apex = { x: seg(dieline, side).x0 + 75, y: dieline.bottomLineY + 75 };
      const at = (l: DielineLine) =>
        [l.from, l.to].some((q) => Math.abs(q.x - apex.x) < 1e-9 && Math.abs(q.y - apex.y) < 1e-9);
      const meeting = dieline.creases.filter(at);
      expect(meeting.map((l) => l.code).sort()).toEqual(['C4', 'C6', 'C6', 'C8']);
      const m = meeting.filter((l) => l.kind === 'MOUNTAIN').length;
      expect(Math.abs(m - (meeting.length - m))).toBe(2);
    }
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
      (l) => ['C2', 'C3', 'C4', 'C6', 'C9'].includes(l.code) && !l.id.endsWith('GLUE'),
    );
    const set = new Set(lines.map((l) => lineKey(l, false)));
    for (const l of lines) expect(set.has(lineKey(l, true))).toBe(true);
  });

  it('marks bleed, safety, bottom allowance and bottom-flap glue zones', () => {
    const zone = (id: string) => dieline.zones.find((z) => z.id === id)!;
    expect(zone('bleed').rect).toEqual({ x: -3, y: -3, width: 703, height: 496 });
    expect(zone('bottom-allowance').rect).toEqual({ x: 0, y: 0, width: 700, height: 90 });
    expect(zone('glue-flap').rect).toEqual(dieline.glueFlap);
    // Glue band OV = 30 mm at the tube end, on the trapezoids only (t ∈ [60, 90]: 80 → 20 mm wide).
    expect(zone('bottom-flap-glue-FRONT').rect).toEqual({ x: 210, y: 0, width: 80, height: 30 });
    expect(zone('bottom-flap-glue-BACK').rect).toEqual({ x: 560, y: 0, width: 80, height: 30 });
    expect(polygonArea(zone('bottom-flap-glue-FRONT').polygon!)).toBeCloseTo(((80 + 20) / 2) * 30);
    // Back trapezoid on top [K]: glue on the print side of the FRONT band, meeting the inside of the BACK band.
    expect(zone('bottom-flap-glue-FRONT').face).toBe('PRINT');
    expect(zone('bottom-flap-glue-BACK').face).toBe('REVERSE');
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
  ])('draws the 110 × 20 mm patch 20 mm below the top, centred on FRONT and BACK [K] (%s)', (_, handle) => {
    const dieline = build(example, handle);
    const rects = Object.fromEntries(dieline.handlePatches.map((p) => [p.id, p.rect]));
    const docY = (y: number) => y - dieline.bottomLineY;
    expect(Object.keys(rects)).toEqual(['patch-FRONT', 'patch-BACK']);
    // FRONT centre x = D + W/2 = 250; y ∈ [H − 40, H − 20] = [360, 380].
    expect(rects['patch-FRONT']).toMatchObject({ x: 195, width: 110, height: 20 });
    expect(docY(rects['patch-FRONT'].y)).toBe(360);
    // BACK is one piece → one patch, centred on BACK (x = 600).
    expect(rects['patch-BACK']).toMatchObject({ x: 545, width: 110, height: 20 });
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
