import { describe, expect, it } from 'vitest';
import type { BufferAttribute } from 'three';
import { getGussetedLayerSteps, gussetedPoint, gussetedPrintNormal } from '../../src/domain/geometry/gussetedAssembly';
import type { BagWindow } from '../../src/domain/types';
import { MM_TO_SCENE, WINDOW_FILM_INSET_MM } from '../../src/renderer/constants';
import {
  createGussetedMeshes,
  getGussetedFrame,
  getGussetedLineSpecs,
  updateGussetedMesh,
  type GussetedMesh,
} from '../../src/renderer/gussetedBagGeometry';

// Gusseted 140 + 90 × 370 with a window in FRONT (docs/SPEC.md §2b): a hole in the wall and a film glued on the
// inside that overlaps the paper around the opening by the film overlap (client [K]) — in every phase of the forming /
// opening timeline.
const dims = { width: 140, height: 370, depth: 90, bottomFold: 25 };
const s = 15;
const rectangle: BagWindow = { type: 'RECTANGLE', material: 'PP', width: 60, height: 100, bottomOffset: 150, filmOverlap: 10 };
const panoramic: BagWindow = { type: 'PANORAMIC', material: 'PP_PERFORATED', width: 40, filmOverlap: 10 };
// Low rectangle: its film reaches below the seal line y = d (FRONT's glued band and upper wall are separate facets).
const low: BagWindow = { type: 'RECTANGLE', material: 'CELLULOSE', width: 60, height: 60, bottomOffset: 20, filmOverlap: 10 };

/** Panel-local centres of the triangles of a mesh. */
function triangleCentres(mesh: GussetedMesh) {
  const centres: { x: number; y: number }[] = [];
  for (let i = 0; i < mesh.local.length; i += 6) {
    centres.push({ x: (mesh.local[i] + mesh.local[i + 2] + mesh.local[i + 4]) / 3, y: (mesh.local[i + 1] + mesh.local[i + 3] + mesh.local[i + 5]) / 3 });
  }
  return centres;
}
const localPoints = (mesh: GussetedMesh) => Array.from({ length: mesh.local.length / 2 }, (_, i) => ({ x: mesh.local[2 * i], y: mesh.local[2 * i + 1] }));

describe('gusseted geometry with a window', () => {
  it.each([
    ['rectangle', rectangle, { x0: 40, x1: 100, y0: 150, y1: 250 }, { x0: 30, x1: 110, y0: 140, y1: 260 }],
    ['panoramic', panoramic, { x0: 50, x1: 90, y0: 40, y1: 370 }, { x0: 40, x1: 100, y0: 30, y1: 370 }],
    ['low rectangle', low, { x0: 40, x1: 100, y0: 20, y1: 80 }, { x0: 30, x1: 110, y0: 10, y1: 90 }],
  ] as const)('%s: leaves the opening out of FRONT and covers it with a film overlapping the paper', (_, window, box, filmBox) => {
    const meshes = createGussetedMeshes(dims, s, window);
    const front = meshes.filter((m) => m.piece.link === 'FRONT' && !m.film);
    const inside = (p: { x: number; y: number }) => p.x > box.x0 && p.x < box.x1 && p.y > box.y0 && p.y < box.y1;
    expect(front.flatMap(triangleCentres).some(inside)).toBe(false);
    // The rest of FRONT is still there (left of the opening).
    expect(front.flatMap(triangleCentres).some((p) => p.x < box.x0 && p.y > box.y0 && p.y < box.y1)).toBe(true);

    const films = meshes.filter((m) => m.film);
    expect(films.length).toBeGreaterThan(0);
    expect(films.every((m) => m.piece.link === 'FRONT' && m.artworkPanel === null)).toBe(true);
    const points = films.flatMap(localPoints);
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    // The film = the opening grown by the 10 mm overlap on every closed side (not above the mouth).
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([filmBox.x0, filmBox.x1, filmBox.y0, filmBox.y1]);
    const uv = films.flatMap((m) => Array.from(m.geometry.getAttribute('uv').array));
    expect(Math.min(...uv)).toBeCloseTo(0, 9);
    expect(Math.max(...uv)).toBeCloseTo(1, 9);
  });

  it('splits the film at the seal line: one film part per FRONT facet it lies on', () => {
    expect(createGussetedMeshes(dims, s, rectangle).filter((m) => m.film).map((m) => m.piece.id)).toEqual(['FRONT_UPPER']);
    expect(createGussetedMeshes(dims, s, low).filter((m) => m.film).map((m) => m.piece.id)).toEqual(['FRONT_UPPER', 'FRONT_BAND']);
  });

  it('poses the film just inside FRONT (glued on the inside) in every phase: sheet, forming, flat, opening, open', () => {
    for (const window of [rectangle, low]) {
      const meshes = createGussetedMeshes(dims, s, window);
      for (const t of [0, 0.1, 0.3, 0.5, 0.6, 0.8, 1]) {
        const frame = getGussetedFrame(dims, s, t);
        const { pose } = frame;
        for (const film of meshes.filter((m) => m.film)) {
          updateGussetedMesh(film, frame);
          const p = film.geometry.getAttribute('position') as BufferAttribute;
          const normal = gussetedPrintNormal(pose, film.piece);
          const frontShift = getGussetedLayerSteps(pose, film.piece) * frame.step;
          localPoints(film).forEach((local, k) => {
            const w = gussetedPoint(pose, film.piece, local.x, local.y);
            // FRONT's rendered surface at this panel point (pose + its layer offset, view shift).
            const onFront = {
              x: w.x + normal.x * frontShift - pose.view.centreX,
              y: w.y + normal.y * frontShift + pose.view.lift,
              z: w.z + normal.z * frontShift,
            };
            const q = { x: p.getX(k) / MM_TO_SCENE, y: p.getY(k) / MM_TO_SCENE, z: p.getZ(k) / MM_TO_SCENE };
            const d = { x: q.x - onFront.x, y: q.y - onFront.y, z: q.z - onFront.z };
            expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(WINDOW_FILM_INSET_MM, 3);
            // On the inner (unprinted) side of FRONT.
            expect(d.x * normal.x + d.y * normal.y + d.z * normal.z).toBeLessThan(0);
          });
        }
      }
    }
  });

  it('draws the opening cut edges from the dieline on FRONT', () => {
    const plain = getGussetedLineSpecs(dims, s).edges;
    const { edges } = getGussetedLineSpecs(dims, s, rectangle);
    const onOpeningEdge = edges.filter(
      (e) => e.piece.link === 'FRONT' && [e.from, e.to].every(([x, y]) => (x === 40 || x === 100) && y >= 150 && y <= 250),
    );
    expect(onOpeningEdge.length).toBeGreaterThanOrEqual(2);
    expect(edges.length).toBeGreaterThan(plain.length);
    // Panoramic: the opening's sides reach the mouth (the notch in the outline), no top edge across the opening.
    const pano = getGussetedLineSpecs(dims, s, panoramic).edges;
    expect(pano.some((e) => e.piece.link === 'FRONT' && e.from[1] === 370 && e.to[1] === 370 && Math.min(e.from[0], e.to[0]) >= 50 && Math.max(e.from[0], e.to[0]) <= 90)).toBe(false);
    expect(pano.some((e) => e.piece.link === 'FRONT' && e.from[0] === 50 && e.to[0] === 50)).toBe(true);
  });

  it('has no film mesh without a window', () => {
    expect(createGussetedMeshes(dims, s).some((m) => m.film)).toBe(false);
  });
});
