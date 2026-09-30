import { describe, expect, it } from 'vitest';
import type { BufferAttribute } from 'three';
import type { BagWindow } from '../../src/domain/types';
import { gussetedPosePoint } from '../../src/domain/geometry/gussetedAssembly';
import { MM_TO_SCENE, WINDOW_FILM_INSET_MM } from '../../src/renderer/constants';
import {
  createGussetedMeshes,
  getGussetedFrame,
  getGussetedLineSpecs,
  updateGussetedMesh,
} from '../../src/renderer/gussetedBagGeometry';

// Gusseted 140 + 90 × 370 with a window in FRONT (docs/SPEC.md §2b): a hole in the wall and a film glued on the
// inside that overlaps the paper around the opening by the film overlap (client [K]).
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
    ['rectangle', rectangle, { x0: 40, x1: 100, y0: 150, y1: 250 }, { x0: 30, x1: 110, y0: 140, y1: 260 }],
    ['panoramic', panoramic, { x0: 50, x1: 90, y0: 40, y1: 370 }, { x0: 40, x1: 100, y0: 30, y1: 370 }],
  ] as const)('%s: leaves the opening out of FRONT and covers it with a film overlapping the paper', (_, window, box, filmBox) => {
    const meshes = createGussetedMeshes(dims, window);
    const front = meshes.find((m) => m.id === 'FRONT')!;
    const inside = (p: { x: number; y: number }) => p.x > box.x0 && p.x < box.x1 && p.y > box.y0 && p.y < box.y1;
    expect(triangleCentres(front).some(inside)).toBe(false);
    // The rest of FRONT is still there (e.g. left of the opening).
    expect(triangleCentres(front).some((p) => p.x < box.x0 && p.y > box.y0 && p.y < box.y1)).toBe(true);

    const film = meshes.find((m) => m.film)!;
    expect(film).toMatchObject({ id: 'WINDOW-FILM', panel: 'FRONT', strip: false });
    const xs = film.samples.map((s) => s.x);
    const ys = film.samples.map((s) => s.y);
    // The film = the opening grown by the 10 mm overlap on every closed side (not above the mouth).
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([filmBox.x0, filmBox.x1, filmBox.y0, filmBox.y1]);
    // UV spans the film 0..1.
    const uv = film.geometry.getAttribute('uv').array;
    expect(Math.min(...uv)).toBe(0);
    expect(Math.max(...uv)).toBe(1);
  });

  it('poses the film just inside FRONT (glued on the inside) in every phase: sheet, forming, open, folding, folded', () => {
    const meshes = createGussetedMeshes(dims, rectangle, 15);
    const front = meshes.find((m) => m.id === 'FRONT')!;
    const film = meshes.find((m) => m.film)!;
    const states: [number, number][] = [[0, 0], [0.2, 0], [0.4, 0], [0.6, 0], [0.9, 0], [1, 0], [1, 0.5], [1, 1]];
    for (const [q0, fold] of states) {
      const frame = getGussetedFrame(dims, 15, q0, fold);
      const { pose } = frame;
      updateGussetedMesh(front, frame);
      updateGussetedMesh(film, frame);
      const position = (mesh: typeof film) => mesh.geometry.getAttribute('position') as BufferAttribute;
      const scene = (p: { x: number; y: number; z: number }) => ({ x: p.x - pose.view.centreX, y: p.y + pose.view.lift, z: p.z });
      // Every film vertex lies WINDOW_FILM_INSET_MM from FRONT's surface at the same panel point, on the inner side.
      film.samples.forEach((sample, k) => {
        const onFront = scene(gussetedPosePoint(pose, 'FRONT', sample.x, sample.y));
        const p = position(film);
        const q = { x: p.getX(k) / MM_TO_SCENE, y: p.getY(k) / MM_TO_SCENE, z: p.getZ(k) / MM_TO_SCENE };
        expect(Math.hypot(q.x - onFront.x, q.y - onFront.y, q.z - onFront.z)).toBeCloseTo(WINDOW_FILM_INSET_MM, 3);
        // Inside: towards BACK once the tube is formed; behind the sheet (−z, its unprinted side) before.
        if (q0 >= 0.5 && fold < 1) {
          const behind = scene(gussetedPosePoint(pose, 'BACK', dims.width - sample.x, sample.y));
          expect(Math.abs(q.z - behind.z)).toBeLessThan(Math.abs(onFront.z - behind.z));
        } else if (q0 === 0) {
          expect(q.z).toBeLessThan(onFront.z);
        }
      });
      expect(front.samples.length).toBeGreaterThan(0);
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
