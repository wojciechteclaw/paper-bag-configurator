import { describe, expect, it } from 'vitest';
import type { BufferAttribute } from 'three';
import type { BagWindow } from '../../src/domain/types';
import { MM_TO_SCENE } from '../../src/renderer/constants';
import {
  createGussetedMeshes,
  getGussetedFrame,
  getGussetedLineSpecs,
  updateGussetedMesh,
} from '../../src/renderer/gussetedBagGeometry';

// Gusseted 140 + 90 × 370 with a window in FRONT (docs/SPEC.md §2b): a hole in the wall, a film mesh in its place.
const dims = { width: 140, height: 370, depth: 90 };
const rectangle: BagWindow = { type: 'RECTANGLE', material: 'PP', width: 60, height: 100, bottomOffset: 150, filmOverlap: 10 };
const panoramic: BagWindow = { type: 'PANORAMIC', material: 'PP_PERFORATED', width: 40, filmOverlap: 10 };

/** Panel-local centres of the triangles of a mesh. */
function triangleCentres(mesh: ReturnType<typeof createGussetedMeshes>[number]) {
  const index = mesh.geometry.getIndex()!.array;
  const centres: { x: number; y: number }[] = [];
  for (let i = 0; i < index.length; i += 3) {
    const [a, b, c] = [index[i], index[i + 1], index[i + 2]].map((k) => mesh.samples[k]);
    centres.push({ x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 });
  }
  return centres;
}

describe('gusseted geometry with a window', () => {
  it.each([
    ['rectangle', rectangle, { x0: 40, x1: 100, y0: 150, y1: 250 }],
    ['panoramic', panoramic, { x0: 50, x1: 90, y0: 40, y1: 370 }],
  ] as const)('%s: leaves the opening out of FRONT and fills it with a film mesh', (_, window, box) => {
    const meshes = createGussetedMeshes(dims, window);
    const front = meshes.find((m) => m.id === 'FRONT')!;
    const inside = (p: { x: number; y: number }) => p.x > box.x0 && p.x < box.x1 && p.y > box.y0 && p.y < box.y1;
    expect(triangleCentres(front).some(inside)).toBe(false);
    // The rest of FRONT is still there (e.g. left of the opening).
    expect(triangleCentres(front).some((p) => p.x < box.x0 && p.y > box.y0 && p.y < box.y1)).toBe(true);

    const film = meshes.find((m) => m.film)!;
    expect(film).toMatchObject({ id: 'WINDOW-FILM', panel: 'FRONT', strip: false });
    expect(triangleCentres(film).every(inside)).toBe(true);
    const xs = film.samples.map((s) => s.x);
    const ys = film.samples.map((s) => s.y);
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([box.x0, box.x1, box.y0, box.y1]);
    // UV spans the opening 0..1.
    const uv = film.geometry.getAttribute('uv').array;
    expect(Math.min(...uv)).toBe(0);
    expect(Math.max(...uv)).toBe(1);
  });

  it('poses the film exactly in FRONT’s surface, open, folded and in between', () => {
    const meshes = createGussetedMeshes(dims, rectangle);
    const front = meshes.find((m) => m.id === 'FRONT')!;
    const film = meshes.find((m) => m.film)!;
    for (const fold of [0, 0.5, 1]) {
      const frame = getGussetedFrame(dims, fold);
      updateGussetedMesh(front, frame);
      updateGussetedMesh(film, frame);
      const position = (mesh: typeof film) => mesh.geometry.getAttribute('position') as BufferAttribute;
      // A film corner coincides with the FRONT vertex at the same panel point.
      const corner = film.samples.findIndex((s) => s.x === 40 && s.y === 150);
      const same = front.samples.findIndex((s) => s.x === 40 && s.y === 150);
      expect(corner).toBeGreaterThanOrEqual(0);
      expect(same).toBeGreaterThanOrEqual(0);
      for (const axis of ['getX', 'getY', 'getZ'] as const) {
        expect(position(film)[axis](corner)).toBeCloseTo(position(front)[axis](same), 9);
      }
      expect(position(film).getY(corner)).toBeCloseTo(150 * MM_TO_SCENE, 6);
    }
  });

  it('draws the opening edges; the panoramic strip interrupts the mouth edge instead of a top edge', () => {
    const plain = getGussetedLineSpecs(dims).edges.length;
    expect(getGussetedLineSpecs(dims, rectangle).edges.length).toBe(plain + 4);
    const { edges } = getGussetedLineSpecs(dims, panoramic);
    // 3 opening edges, and FRONT's mouth edge split in two.
    expect(edges.length).toBe(plain + 4);
    const mouth = edges.filter((e) => e.panel === 'FRONT' && e.points.every((p) => p.y === dims.height));
    expect(mouth.map((e) => [e.points[0].x, e.points[e.points.length - 1].x])).toEqual([
      [0, 50],
      [90, 140],
    ]);
  });

  it('has no film mesh without a window', () => {
    expect(createGussetedMeshes(dims).some((m) => m.film)).toBe(false);
  });
});
