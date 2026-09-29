import { describe, expect, it } from 'vitest';
import {
  findRegion,
  getBottomCreases,
  getBottomFlapOverlap,
  getBottomLayout,
  getBottomPieces,
  getPanelCreases,
  getPanelRegions,
  getVisibleBottomPieces,
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

describe('block bottom', () => {
  it('overlaps the flaps by 30 mm (2a − D)', () => {
    expect(getBottomFlapOverlap(dims)).toBe(30);
    expect(getBottomFlapOverlap({ depth: 40 })).toBe(30);
  });

  it('lays out flaps within the W × D bottom (docs/PRODUCTION.md §10.4)', () => {
    const b = getBottomLayout(dims);
    expect(polygonArea(b.outline)).toBe(200 * 150);
    expect(polygonArea(b.frontFlap)).toBe(200 * 90);
    expect(polygonArea(b.backFlap)).toBe(200 * 90);
    expect(polygonArea(b.overlap)).toBe(200 * 30);
    expect(b.overlap.map((p) => p.y).sort((x, y) => x - y)).toEqual([60, 60, 90, 90]);
    for (const polygon of [...Object.values(b.tucks), ...Object.values(b.ears)]) {
      expect(polygonArea(polygon)).toBeGreaterThan(0);
      polygon.forEach((p) => expect(pointInConvexPolygon(p, b.outline)).toBe(true));
    }
    expect(b.tucks.LEFT).toContainEqual({ x: 75, y: 75 });
    expect(b.tucks.RIGHT).toContainEqual({ x: 125, y: 75 });
  });

  it('lists seam, overlap edge, tuck diagonals and ear creases on the underside', () => {
    const creases = getBottomCreases(dims);
    expect(creases.find((c) => c.kind === 'BOTTOM_FLAP_SEAM')!.segment.from.y).toBe(90); // outer BACK flap edge [K]
    expect(creases.find((c) => c.kind === 'BOTTOM_FLAP_OVERLAP')!.segment.from.y).toBe(60);
    expect(creases.filter((c) => c.kind === 'BOTTOM_TUCK_DIAGONAL')).toHaveLength(4);
    const ears = creases.filter((c) => c.kind === 'BOTTOM_EAR_CENTRE');
    expect(ears.map((c) => c.segment.from.x).sort((a, b) => a - b)).toEqual([75, 125]);
    ears.forEach((c) => expect(Math.abs(c.segment.to.y - c.segment.from.y)).toBe(30));
  });
});

describe('bottom pieces in their wall artwork space (SPEC §4f)', () => {
  const d = { width: 200, height: 400, depth: 150 }; // a = 90, h = 75
  const a = 90;
  const wallWidth = (panel: string) => (panel === 'FRONT' || panel === 'BACK' ? d.width : d.depth);

  it('maps every piece into its wall allowance strip, printed side out except the ears', () => {
    for (const piece of getBottomPieces(d)) {
      const mapped = piece.polygon.map(piece.toPanel);
      for (const p of mapped) {
        expect(p.x).toBeGreaterThanOrEqual(-1e-9);
        expect(p.x).toBeLessThanOrEqual(wallWidth(piece.panel) + 1e-9);
        expect(p.y).toBeGreaterThanOrEqual(-a - 1e-9);
        expect(p.y).toBeLessThanOrEqual(1e-9);
      }
      // Orientation: the map preserves CCW (printed side seen from below) unless the piece is folded back.
      expect(Math.sign(polygonArea(mapped))).toBe(piece.printedSideOut ? 1 : -1);
    }
  });

  it('tiles each allowance strip exactly (area Pw × a per wall)', () => {
    const pieces = getBottomPieces(d);
    for (const panel of ['FRONT', 'BACK', 'LEFT', 'RIGHT'] as const) {
      const area = pieces.filter((p) => p.panel === panel).reduce((sum, p) => sum + Math.abs(polygonArea(p.polygon)), 0);
      expect(area).toBeCloseTo(wallWidth(panel) * a);
    }
  });

  const near = (p: { x: number; y: number }, q: { x: number; y: number }) => {
    expect(p.x).toBeCloseTo(q.x);
    expect(p.y + 0).toBeCloseTo(q.y + 0);
  };

  it('continues the wall across its bottom crease (hinge points map to y = 0 at the same wall x)', () => {
    const pieces = Object.fromEntries(getBottomPieces(d).map((p) => [p.id, p]));
    // Front crease y_b = D ↔ FRONT (x, 0); back crease y_b = 0 ↔ BACK (W − x, 0).
    near(pieces.FRONT_FLAP.toPanel({ x: 30, y: 150 }), { x: 30, y: 0 });
    near(pieces.BACK_FLAP.toPanel({ x: 30, y: 0 }), { x: 170, y: 0 });
    // Side bottom lines: LEFT (x, 0) ↔ bottom (0, x); RIGHT (x, 0) ↔ bottom (W, D − x).
    near(pieces.TUCK_LEFT.toPanel({ x: 0, y: 40 }), { x: 40, y: 0 });
    near(pieces.TUCK_RIGHT.toPanel({ x: 200, y: 40 }), { x: 110, y: 0 });
    // Ears stay attached along the 45° creases shared with the tuck.
    near(pieces.EAR_LEFT_BACK.toPanel({ x: 20, y: 20 }), pieces.TUCK_LEFT.toPanel({ x: 20, y: 20 }));
    near(pieces.EAR_RIGHT_FRONT.toPanel({ x: 180, y: 130 }), pieces.TUCK_RIGHT.toPanel({ x: 180, y: 130 }));
  });

  it('shows only the two flaps from below (BACK flap outermost, client rule), covering the whole bottom', () => {
    const visible = getVisibleBottomPieces(d);
    expect(visible.map((p) => p.id)).toEqual(['BACK_FLAP', 'FRONT_FLAP']);
    expect(getBottomPieces(d).find((p) => p.id === 'BACK_FLAP')!.layer).toBe(0);
    expect(visible[0].polygon.map((p) => p.y).sort((x, y) => x - y)).toEqual([0, 0, a, a]);
    expect(visible[1].polygon.map((p) => p.y).sort((x, y) => x - y)).toEqual([a, a, 150, 150]);
    expect(visible.reduce((sum, p) => sum + Math.abs(polygonArea(p.polygon)), 0)).toBeCloseTo(200 * 150);
  });
});
