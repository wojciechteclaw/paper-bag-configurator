import { describe, expect, it } from 'vitest';
import {
  getSidePanelApex,
  getSidePanelCreases,
  getSidePanelRegions,
  polygonArea,
  type Point2,
  type Polygon2,
} from './sideGusset';

const dims = { width: 200, height: 400, depth: 150 };

/** Strictly inside a CCW convex polygon (points on an edge are excluded). */
function strictlyInside(p: Point2, polygon: Polygon2): boolean {
  return polygon.every((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) > 1e-9;
  });
}

describe('side panel creases', () => {
  it('meet at the apex (D/2, D/2)', () => {
    expect(getSidePanelApex(dims)).toEqual({ x: 75, y: 75 });
    const { centre, left, right } = getSidePanelCreases(dims);
    expect(centre).toEqual({ from: { x: 75, y: 75 }, to: { x: 75, y: 400 } });
    expect(left).toEqual({ from: { x: 0, y: 0 }, to: { x: 75, y: 75 } });
    expect(right).toEqual({ from: { x: 150, y: 0 }, to: { x: 75, y: 75 } });
  });

  it('draws the diagonal creases at 45°', () => {
    const { left, right } = getSidePanelCreases(dims);
    expect(left.to.y - left.from.y).toBeCloseTo(left.to.x - left.from.x);
    expect(right.to.y - right.from.y).toBeCloseTo(right.from.x - right.to.x);
  });
});

describe('side panel regions', () => {
  it.each([dims, { width: 260, height: 170, depth: 260 }, { width: 75, height: 430, depth: 40 }])(
    'tile the panel exactly for %o',
    (d) => {
      const regions = getSidePanelRegions(d);
      const areas = Object.values(regions).map(polygonArea);
      areas.forEach((a) => expect(a).toBeGreaterThan(0)); // all counter-clockwise
      expect(areas.reduce((s, a) => s + a, 0)).toBeCloseTo(d.depth * d.height, 6);
    },
  );

  it('do not overlap and cover every interior sample point once', () => {
    const regions = Object.values(getSidePanelRegions(dims));
    for (let x = 0.5; x < dims.depth; x += 3.7) {
      for (let y = 0.5; y < dims.height; y += 3.7) {
        const hits = regions.filter((r) => strictlyInside({ x, y }, r)).length;
        // Samples exactly on a crease belong to no region's interior.
        const onCrease =
          (y >= 75 && Math.abs(x - 75) < 1e-9) ||
          (x <= 75 && Math.abs(y - x) < 1e-9) ||
          (x >= 75 && Math.abs(y - (150 - x)) < 1e-9);
        expect(hits).toBe(onCrease ? 0 : 1);
      }
    }
  });

  it('keeps T as the triangle below both 45° creases', () => {
    expect(getSidePanelRegions(dims).T).toEqual([
      { x: 0, y: 0 },
      { x: 150, y: 0 },
      { x: 75, y: 75 },
    ]);
  });
});
