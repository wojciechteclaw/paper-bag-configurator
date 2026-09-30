import { describe, expect, it } from 'vitest';
import {
  findRegion,
  getBottomCreases,
  getBottomFlapOverlap,
  getBottomPieces,
  getBottomTrapezoidDepth,
  getBottomZoneDiagonals,
  getBottomZonePieces,
  getInnerBottomEdges,
  getInnerVisibleBottomPieces,
  INNER_BOTTOM_STACK,
  subtractConvexPolygon,
  getPanelCreases,
  getPanelRegions,
  getVisibleBottomPieces,
  getVisibleBottomZoneParts,
  isBottomTrapezoidDegenerate,
  pointInConvexPolygon,
  type FoldPanelId,
} from './blockBottom';
import { polygonArea } from './sideGusset';

const dims = { width: 200, height: 400, depth: 150 };
const PANELS: FoldPanelId[] = ['FRONT', 'BACK', 'LEFT', 'RIGHT', 'BOTTOM'];

function panelArea(panel: FoldPanelId, d = dims) {
  if (panel === 'BOTTOM') return d.width * d.depth;
  return (panel === 'FRONT' || panel === 'BACK' ? d.width : d.depth) * d.height;
}

describe('panel regions', () => {
  it.each(PANELS)('%s regions are CCW and tile the visible panel', (panel) => {
    for (const d of [dims, { width: 260, height: 170, depth: 260 }, { width: 75, height: 430, depth: 40 }]) {
      const regions = getPanelRegions(panel, d);
      regions.forEach((r) => expect(polygonArea(r.polygon)).toBeGreaterThan(0));
      expect(regions.reduce((s, r) => s + polygonArea(r.polygon), 0)).toBeCloseTo(panelArea(panel, d), 6);
    }
  });

  it('interior sample points lie in exactly one side region', () => {
    for (const panel of ['LEFT', 'RIGHT'] as const) {
      const regions = getPanelRegions(panel, dims);
      for (let x = 0.7; x < dims.depth; x += 3.3) {
        for (let y = 0.7; y < dims.height; y += 3.3) {
          const hits = regions.filter((r) => pointInConvexPolygon({ x, y }, r.polygon, -1e-6)).length;
          expect(hits).toBeLessThanOrEqual(1);
          expect(regions.filter((r) => pointInConvexPolygon({ x, y }, r.polygon)).length).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('follows docs/PRODUCTION.md §10.3 for LEFT (x = 0 at BACK)', () => {
    const byId = Object.fromEntries(getPanelRegions('LEFT', dims).map((r) => [r.id, r.polygon]));
    expect(byId.SIDE_T).toEqual([
      { x: 0, y: 0 },
      { x: 150, y: 0 },
      { x: 75, y: 75 },
    ]);
    expect(byId.SIDE_BACK_LOWER).toContainEqual({ x: 0, y: 75 });
    expect(Math.max(...byId.SIDE_FRONT.map((p) => p.x))).toBe(150);
  });

  it('mirrors RIGHT (x = 0 at FRONT): the back half is on the right', () => {
    const right = getPanelRegions('RIGHT', dims);
    expect(findRegion(right, { x: 140, y: 60 })?.id).toBe('SIDE_BACK_LOWER');
    expect(findRegion(right, { x: 10, y: 200 })?.id).toBe('SIDE_FRONT');
    expect(findRegion(right, { x: 140, y: 200 })?.id).toBe('SIDE_BACK_UPPER');
    expect(findRegion(right, { x: 75, y: 10 })?.id).toBe('SIDE_T');
  });

  it('splits BACK on the pleat y = D/2', () => {
    const back = getPanelRegions('BACK', dims);
    expect(findRegion(back, { x: 10, y: 10 })?.id).toBe('BACK_LOWER');
    expect(findRegion(back, { x: 10, y: 100 })?.id).toBe('BACK_UPPER');
  });
});

describe('panel creases', () => {
  it('FRONT has none, BACK has the full-width pleat', () => {
    expect(getPanelCreases('FRONT', dims)).toEqual([]);
    expect(getPanelCreases('BACK', dims)).toEqual([
      { kind: 'FLAT_FOLD_PLEAT', segment: { from: { x: 0, y: 75 }, to: { x: 200, y: 75 } } },
    ]);
  });

  it('LEFT has centre, two 45° creases and the pleat on its back half', () => {
    const creases = getPanelCreases('LEFT', dims);
    expect(creases.map((c) => c.kind).sort()).toEqual(
      ['FLAT_FOLD_PLEAT', 'SIDE_CENTRE', 'SIDE_DIAGONAL_BACK', 'SIDE_DIAGONAL_FRONT'].sort(),
    );
    const pleat = creases.find((c) => c.kind === 'FLAT_FOLD_PLEAT')!.segment;
    expect(pleat).toEqual({ from: { x: 0, y: 75 }, to: { x: 75, y: 75 } });
    for (const c of creases.filter((c) => c.kind.startsWith('SIDE_DIAGONAL'))) {
      const { from, to } = c.segment;
      expect(Math.abs(to.y - from.y)).toBeCloseTo(Math.abs(to.x - from.x));
    }
  });

  it('RIGHT puts the pleat on its back half (x ∈ [D/2, D])', () => {
    const pleat = getPanelCreases('RIGHT', dims).find((c) => c.kind === 'FLAT_FOLD_PLEAT')!.segment;
    expect([pleat.from.x, pleat.to.x].sort((a, b) => a - b)).toEqual([75, 150]);
  });

  it('every crease meets the apex or lies on a region boundary', () => {
    for (const panel of ['LEFT', 'RIGHT', 'BACK'] as const) {
      const regions = getPanelRegions(panel, dims);
      for (const { segment } of getPanelCreases(panel, dims)) {
        const mid = { x: (segment.from.x + segment.to.x) / 2, y: (segment.from.y + segment.to.y) / 2 };
        // A crease between two regions is contained (inclusively) in two of them.
        expect(regions.filter((r) => pointInConvexPolygon(mid, r.polygon)).length).toBe(2);
      }
    }
  });
});

describe('block bottom zones (client model [K]: sides whole, FRONT / BACK trapezoids)', () => {
  const E = 90; // (150 + 30) / 2

  it('overlaps the trapezoids by 30 mm (2E − D)', () => {
    expect(getBottomFlapOverlap(dims)).toBe(30);
    expect(getBottomFlapOverlap({ depth: 40 })).toBe(30);
  });

  it('keeps each side zone whole (one D × E piece, no crease inside)', () => {
    for (const panel of ['LEFT', 'RIGHT'] as const) {
      const pieces = getBottomZonePieces(panel, dims);
      expect(pieces.map((p) => p.id)).toEqual(['SIDE_FLAP']);
      expect(polygonArea(pieces[0].polygon)).toBeCloseTo(150 * E);
    }
  });

  it('splits FRONT / BACK zones by the 45° creases into a trapezoid W → W − 2E and two corner triangles', () => {
    for (const panel of ['FRONT', 'BACK'] as const) {
      const byId = Object.fromEntries(getBottomZonePieces(panel, dims).map((p) => [p.id, p.polygon]));
      expect(byId.TRAPEZOID).toEqual([
        { x: 0, y: 0 },
        { x: 90, y: -90 },
        { x: 110, y: -90 },
        { x: 200, y: 0 },
      ]);
      expect(byId.EAR_START).toEqual([
        { x: 0, y: 0 },
        { x: 0, y: -90 },
        { x: 90, y: -90 },
      ]);
      expect(polygonArea(byId.EAR_END)).toBeCloseTo((E * E) / 2);
    }
    expect(getBottomZoneDiagonals(dims)).toEqual([
      { from: { x: 0, y: 0 }, to: { x: 90, y: -90 } },
      { from: { x: 200, y: 0 }, to: { x: 110, y: -90 } },
    ]);
  });

  it.each([dims, { width: 260, height: 170, depth: 260 }, { width: 75, height: 430, depth: 40 }, { width: 120, height: 300, depth: 110 }])(
    'tiles every zone exactly, CCW (%o)',
    (d) => {
      const e = (d.depth + 30) / 2;
      for (const panel of ['FRONT', 'BACK', 'LEFT', 'RIGHT'] as const) {
        const pieces = getBottomZonePieces(panel, d);
        pieces.forEach((p) => expect(polygonArea(p.polygon)).toBeGreaterThan(0));
        const width = panel === 'FRONT' || panel === 'BACK' ? d.width : d.depth;
        expect(pieces.reduce((sum, p) => sum + polygonArea(p.polygon), 0)).toBeCloseTo(width * e, 6);
        pieces.forEach((p) => p.polygon.forEach((q) => expect(Number.isFinite(q.x) && Number.isFinite(q.y)).toBe(true)));
      }
    },
  );

  it('degrades a narrow bag (W < D + 30) into a triangle without NaN', () => {
    const narrow = { width: 120, height: 300, depth: 110 }; // E = 70 > W/2 = 60
    expect(isBottomTrapezoidDegenerate(narrow)).toBe(true);
    expect(isBottomTrapezoidDegenerate(dims)).toBe(false);
    expect(isBottomTrapezoidDegenerate({ width: 180, depth: 150 })).toBe(false); // W = D + 30 exactly
    expect(getBottomTrapezoidDepth(narrow)).toBe(60);
    const trapezoid = getBottomZonePieces('FRONT', narrow).find((p) => p.id === 'TRAPEZOID')!.polygon;
    expect(trapezoid).toEqual([
      { x: 0, y: 0 },
      { x: 60, y: -60 },
      { x: 120, y: 0 },
    ]);
    const ear = getBottomZonePieces('FRONT', narrow).find((p) => p.id === 'EAR_START')!.polygon;
    expect(ear).toHaveLength(4); // quadrilateral up to x = W/2
    const visible = getVisibleBottomPieces(narrow);
    const area = visible.flatMap((p) => p.visibleParts).reduce((sum, p) => sum + polygonArea(p), 0);
    expect(area).toBeCloseTo(120 * 110, 6);
    getBottomCreases(narrow).forEach((c) => expect(Number.isFinite(c.segment.to.x + c.segment.to.y)).toBe(true));
  });
});

describe('formed bottom seen from below (BOTTOM-local)', () => {
  const d = { width: 200, height: 400, depth: 150 }; // E = 90
  const E = 90;
  const wallWidth = (panel: string) => (panel === 'FRONT' || panel === 'BACK' ? d.width : d.depth);
  const pieces = Object.fromEntries(getBottomPieces(d).map((p) => [p.id, p]));

  it('maps every piece into its wall zone, printed side out except the corner triangles', () => {
    for (const piece of getBottomPieces(d)) {
      const mapped = piece.polygon.map(piece.toPanel);
      for (const p of mapped) {
        expect(p.x).toBeGreaterThanOrEqual(-1e-9);
        expect(p.x).toBeLessThanOrEqual(wallWidth(piece.panel) + 1e-9);
        expect(p.y).toBeGreaterThanOrEqual(-E - 1e-9);
        expect(p.y).toBeLessThanOrEqual(1e-9);
      }
      // Orientation: the map preserves CCW (printed side seen from below) unless the piece is turned over.
      expect(Math.sign(polygonArea(mapped))).toBe(piece.printedSideOut ? 1 : -1);
      for (const p of piece.polygon) {
        const back = piece.fromPanel(piece.toPanel(p));
        expect(back.x).toBeCloseTo(p.x, 9);
        expect(back.y).toBeCloseTo(p.y, 9);
      }
    }
  });

  it('tiles each zone exactly (area Pw × E per wall) and stays inside the W × D outline', () => {
    const all = getBottomPieces(d);
    for (const panel of ['FRONT', 'BACK', 'LEFT', 'RIGHT'] as const) {
      const area = all.filter((p) => p.panel === panel).reduce((sum, p) => sum + Math.abs(polygonArea(p.polygon)), 0);
      expect(area).toBeCloseTo(wallWidth(panel) * E);
    }
    const outline = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 150 },
      { x: 0, y: 150 },
    ];
    all.forEach((piece) => piece.polygon.forEach((p) => expect(pointInConvexPolygon(p, outline)).toBe(true)));
  });

  const near = (p: { x: number; y: number }, q: { x: number; y: number }) => {
    expect(p.x + 0).toBeCloseTo(q.x + 0);
    expect(p.y + 0).toBeCloseTo(q.y + 0);
  };

  it('continues every wall across its bottom line and joins the corner triangles to the side flaps', () => {
    // Front crease y_b = D ↔ FRONT (x, 0); back crease y_b = 0 ↔ BACK (W − x, 0).
    near(pieces.FRONT_TRAPEZOID.toPanel({ x: 30, y: 150 }), { x: 30, y: 0 });
    near(pieces.BACK_TRAPEZOID.toPanel({ x: 30, y: 0 }), { x: 170, y: 0 });
    // Side bottom lines: LEFT (x, 0) ↔ bottom (0, x); RIGHT (x, 0) ↔ bottom (W, D − x).
    near(pieces.SIDE_FLAP_LEFT.toPanel({ x: 0, y: 40 }), { x: 40, y: 0 });
    near(pieces.SIDE_FLAP_RIGHT.toPanel({ x: 200, y: 40 }), { x: 110, y: 0 });
    // Tube corner edge in the zone (depth t): the corner triangle's edge and the side flap's edge meet on the bottom line.
    for (const t of [0, 30, 90]) {
      near(pieces.FRONT_EAR_LEFT.fromPanel({ x: 0, y: -t }), pieces.SIDE_FLAP_LEFT.fromPanel({ x: 150, y: -t }));
      near(pieces.FRONT_EAR_RIGHT.fromPanel({ x: 200, y: -t }), pieces.SIDE_FLAP_RIGHT.fromPanel({ x: 0, y: -t }));
      near(pieces.BACK_EAR_RIGHT.fromPanel({ x: 0, y: -t }), pieces.SIDE_FLAP_RIGHT.fromPanel({ x: 150, y: -t }));
      near(pieces.BACK_EAR_LEFT.fromPanel({ x: 200, y: -t }), pieces.SIDE_FLAP_LEFT.fromPanel({ x: 0, y: -t }));
    }
    // 45° creases: the corner triangle turns over its diagonal and stays joined to the trapezoid.
    near(pieces.FRONT_EAR_LEFT.fromPanel({ x: 40, y: -40 }), pieces.FRONT_TRAPEZOID.fromPanel({ x: 40, y: -40 }));
    near(pieces.BACK_EAR_LEFT.fromPanel({ x: 160, y: -40 }), pieces.BACK_TRAPEZOID.fromPanel({ x: 160, y: -40 }));
    // Every corner triangle ends up inside the footprint of its own trapezoid (tucked under it).
    for (const [ear, trapezoid] of [
      ['FRONT_EAR_LEFT', 'FRONT_TRAPEZOID'],
      ['FRONT_EAR_RIGHT', 'FRONT_TRAPEZOID'],
      ['BACK_EAR_LEFT', 'BACK_TRAPEZOID'],
      ['BACK_EAR_RIGHT', 'BACK_TRAPEZOID'],
    ] as const) {
      pieces[ear].polygon.forEach((p) => expect(pointInConvexPolygon(p, pieces[trapezoid].polygon)).toBe(true));
    }
  });

  it('stacks side flaps innermost, then FRONT ears, FRONT trapezoid, BACK ears, BACK trapezoid outermost [K]', () => {
    const layer = (id: string) => pieces[id].layer;
    expect(layer('BACK_TRAPEZOID')).toBe(0);
    expect(layer('BACK_EAR_LEFT')).toBeGreaterThan(layer('BACK_TRAPEZOID'));
    expect(layer('FRONT_TRAPEZOID')).toBeGreaterThan(layer('BACK_EAR_LEFT'));
    expect(layer('FRONT_EAR_LEFT')).toBeGreaterThan(layer('FRONT_TRAPEZOID'));
    expect(layer('SIDE_FLAP_LEFT')).toBeGreaterThan(layer('FRONT_EAR_LEFT'));
    expect(layer('SIDE_FLAP_RIGHT')).toBe(layer('SIDE_FLAP_LEFT'));
  });

  it('shows W × D from below: BACK trapezoid, the free part of the FRONT trapezoid and the two side triangles', () => {
    const visible = getVisibleBottomPieces(d);
    expect(visible.map((p) => p.id)).toEqual(['BACK_TRAPEZOID', 'FRONT_TRAPEZOID', 'SIDE_FLAP_LEFT', 'SIDE_FLAP_RIGHT']);
    const area = (id: string) =>
      visible.find((p) => p.id === id)!.visibleParts.reduce((sum, part) => sum + polygonArea(part), 0);
    expect(area('BACK_TRAPEZOID')).toBeCloseTo(((200 + 20) / 2) * 90);
    expect(area('SIDE_FLAP_LEFT')).toBeCloseTo((150 * 75) / 2); // triangle (0,0),(D/2,D/2),(0,D)
    expect(visible[2].visibleParts[0]).toEqual(expect.arrayContaining([{ x: 75, y: 75 }]));
    expect(area('FRONT_TRAPEZOID')).toBeCloseTo(200 * 150 - area('BACK_TRAPEZOID') - 2 * area('SIDE_FLAP_LEFT'));
    // Every visible part is convex, CCW and inside the outline; no two parts overlap (sample points).
    const parts = visible.flatMap((p) => p.visibleParts);
    parts.forEach((part) => expect(polygonArea(part)).toBeGreaterThan(0));
    for (let x = 1.3; x < 200; x += 6.1) {
      for (let y = 1.1; y < 150; y += 5.3) {
        expect(parts.filter((part) => pointInConvexPolygon({ x, y }, part, -1e-6)).length).toBeLessThanOrEqual(1);
        expect(parts.filter((part) => pointInConvexPolygon({ x, y }, part)).length).toBeGreaterThanOrEqual(1);
      }
    }
    // The BACK trapezoid is outermost: nothing else is visible where it lies.
    expect(pointInConvexPolygon({ x: 100, y: 40 }, visible[0].polygon)).toBe(true);
  });

  it('draws the "X" and the glue seam on the underside', () => {
    const creases = getBottomCreases(d);
    expect(creases.filter((c) => c.kind === 'BOTTOM_TRAPEZOID_DIAGONAL').map((c) => c.segment)).toEqual([
      { from: { x: 0, y: 0 }, to: { x: 90, y: 90 } },
      { from: { x: 200, y: 0 }, to: { x: 110, y: 90 } },
      { from: { x: 0, y: 150 }, to: { x: 75, y: 75 } },
      { from: { x: 200, y: 150 }, to: { x: 125, y: 75 } },
    ]);
    expect(creases.find((c) => c.kind === 'BOTTOM_FLAP_SEAM')!.segment).toEqual({ from: { x: 90, y: 90 }, to: { x: 110, y: 90 } });
  });

  it('lists the visible parts of each zone in panel-local mm (ears never visible)', () => {
    const area = (panel: 'FRONT' | 'BACK' | 'LEFT' | 'RIGHT') =>
      getVisibleBottomZoneParts(panel, d).reduce((sum, part) => sum + polygonArea(part), 0);
    expect(area('BACK')).toBeCloseTo(110 * 90);
    expect(area('LEFT')).toBeCloseTo((150 * 75) / 2);
    expect(area('RIGHT')).toBeCloseTo((150 * 75) / 2);
    const left = getVisibleBottomZoneParts('LEFT', d)[0];
    expect(left).toEqual(expect.arrayContaining([{ x: 75, y: -75 }])); // the side triangle, apex D/2 deep
    getVisibleBottomZoneParts('FRONT', d).forEach((part) =>
      part.forEach((p) => expect(p.y).toBeLessThanOrEqual(1e-9)),
    );
  });
});

describe('formed bottom seen from inside (open top)', () => {
  const GLUE = 10;
  const d = { width: 200, height: 400, depth: 150 }; // E = 90, strip between the side flaps x ∈ [90, 110]

  it('subtracts a convex polygon into disjoint convex parts', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const hole = [
      { x: 2, y: 2 },
      { x: 5, y: 2 },
      { x: 5, y: 5 },
      { x: 2, y: 5 },
    ];
    const parts = subtractConvexPolygon(square, hole);
    parts.forEach((part) => expect(polygonArea(part)).toBeGreaterThan(0));
    expect(parts.reduce((sum, part) => sum + polygonArea(part), 0)).toBeCloseTo(100 - 9);
    expect(subtractConvexPolygon(hole, square)).toEqual([]);
  });

  it('shows the glue flap strip, both side flaps and, between them, the FRONT / BACK trapezoids [K]', () => {
    const pieces = getInnerVisibleBottomPieces(d, GLUE);
    const area = (id: string) =>
      (pieces.find((p) => p.id === id)?.visibleParts ?? []).reduce((sum, part) => sum + polygonArea(part), 0);
    expect(pieces.filter((p) => p.visibleParts.length > 0).map((p) => p.id)).toEqual([
      'GLUE_FLAP',
      'SIDE_FLAP_LEFT',
      'SIDE_FLAP_RIGHT',
      'FRONT_TRAPEZOID',
      'BACK_TRAPEZOID',
    ]);
    expect(area('GLUE_FLAP')).toBeCloseTo(10 * 90 - (10 * 10) / 2); // strip on the back crease, 45° chamfer at x = E
    expect(area('SIDE_FLAP_LEFT')).toBeCloseTo(90 * 150 - area('GLUE_FLAP'));
    expect(area('SIDE_FLAP_RIGHT')).toBeCloseTo(90 * 150);
    expect(area('FRONT_TRAPEZOID')).toBeCloseTo(20 * 90); // strip, y ∈ [D − E, D]
    expect(area('BACK_TRAPEZOID')).toBeCloseTo(20 * 60); // strip, y ∈ [0, D − E): the rest lies under the FRONT one
    for (const ear of ['FRONT_EAR_LEFT', 'FRONT_EAR_RIGHT', 'BACK_EAR_LEFT', 'BACK_EAR_RIGHT']) expect(area(ear)).toBe(0);
  });

  it.each([
    { width: 200, depth: 150 },
    { width: 400, depth: 150 },
    { width: 250, depth: 200 }, // client example, E = 115
    { width: 180, depth: 150 }, // W = 2E: no strip
    { width: 160, depth: 150 }, // W < 2E: the side flaps overlap, the trapezoids degenerate
    { width: 150, depth: 150 },
  ])('tiles W × D exactly with the innermost layer at every point ($width × $depth)', (dd) => {
    for (const glue of [GLUE, 0]) {
      const pieces = getInnerVisibleBottomPieces(dd, glue);
      const parts = pieces.flatMap((p) => p.visibleParts.map((part) => ({ id: p.id, part })));
      parts.forEach(({ part }) => {
        expect(polygonArea(part)).toBeGreaterThan(0);
        part.forEach((p) => {
          expect(p.x).toBeGreaterThanOrEqual(-1e-9);
          expect(p.x).toBeLessThanOrEqual(dd.width + 1e-9);
          expect(p.y).toBeGreaterThanOrEqual(-1e-9);
          expect(p.y).toBeLessThanOrEqual(dd.depth + 1e-9);
        });
      });
      expect(parts.reduce((sum, { part }) => sum + polygonArea(part), 0)).toBeCloseTo(dd.width * dd.depth, 6);
      expect(pieces.map((p) => INNER_BOTTOM_STACK.indexOf(p.id))).toEqual(pieces.map((p) => p.depthFromInside));
      // Layer order: every sample point shows the first piece of INNER_BOTTOM_STACK that contains it.
      for (let x = 0.9; x < dd.width; x += 4.7) {
        for (let y = 0.8; y < dd.depth; y += 4.3) {
          const p = { x, y };
          const strictly = parts.filter(({ part }) => pointInConvexPolygon(p, part, -1e-6));
          expect(strictly.length).toBeLessThanOrEqual(1);
          expect(parts.some(({ part }) => pointInConvexPolygon(p, part, 1e-6))).toBe(true);
          const innermost = pieces.find((piece) => pointInConvexPolygon(p, piece.polygon, -1e-6));
          if (innermost && strictly.length === 1) expect(strictly[0].id).toBe(innermost.id);
        }
      }
    }
  });

  it('draws the paper edges seen from inside: flap edges, the FRONT trapezoid end and the glue flap strip', () => {
    const round = (v: number) => Math.round(v * 1000) / 1000;
    const keys = getInnerBottomEdges(d, GLUE).map(({ piece, segment }) => {
      const ends = [segment.from, segment.to].map((p) => `${round(p.x)},${round(p.y)}`).sort();
      return `${piece}:${ends.join('–')}`;
    });
    expect(keys.sort()).toEqual(
      [
        'GLUE_FLAP:80,10–90,0',
        'GLUE_FLAP:0,10–80,10',
        'SIDE_FLAP_LEFT:90,0–90,150',
        'SIDE_FLAP_RIGHT:110,0–110,150',
        'FRONT_TRAPEZOID:110,60–90,60',
      ].sort(),
    );
  });

  it('never draws a covered edge (ears, diagonals, BACK trapezoid end) or an outline edge', () => {
    for (const dd of [d, { width: 400, depth: 150 }, { width: 160, depth: 150 }]) {
      const pieces = getInnerVisibleBottomPieces(dd, GLUE);
      const edges = getInnerBottomEdges(dd, GLUE);
      expect(edges.length).toBeGreaterThan(0);
      for (const { piece, segment } of edges) {
        const k = pieces.findIndex((p) => p.id === piece);
        const mid = { x: (segment.from.x + segment.to.x) / 2, y: (segment.from.y + segment.to.y) / 2 };
        pieces.slice(0, k).forEach((inner) => expect(pointInConvexPolygon(mid, inner.polygon, 1e-6)).toBe(false));
        expect(piece.includes('EAR')).toBe(false);
        const onOutline =
          (segment.from.y === segment.to.y && [0, dd.depth].includes(segment.from.y)) ||
          (segment.from.x === segment.to.x && [0, dd.width].includes(segment.from.x));
        expect(onOutline).toBe(false);
      }
    }
  });
});
