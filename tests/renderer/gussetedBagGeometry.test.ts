import type { BufferAttribute } from 'three';
import { describe, expect, it } from 'vitest';
import { getGussetedPieces } from '../../src/domain/geometry/gussetedAssembly';
import { MM_TO_SCENE } from '../../src/renderer/constants';
import {
  createGussetedMeshes,
  getGussetedFrame,
  getGussetedLineSpecs,
  getGussetedSheetViewExtent,
  GUSSETED_LAYER_STEP_MM,
  updateGussetedMesh,
  writeGussetedLines,
} from '../../src/renderer/gussetedBagGeometry';

const dims = { width: 150, height: 250, depth: 60, bottomFold: 25 };
const s = 15;

function bounds(values: ArrayLike<number>, axis: number) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = axis; i < values.length; i += 3) {
    min = Math.min(min, values[i]);
    max = Math.max(max, values[i]);
  }
  return { min, max };
}

describe('gusseted bag geometry (renderer)', () => {
  it('creates one mesh per rigid facet with the wall UV basis; the seam flap is unprinted', () => {
    const meshes = createGussetedMeshes(dims, s);
    expect(meshes.map((m) => m.piece.id)).toEqual(getGussetedPieces(dims, s).map((p) => p.id));
    const front = meshes.find((m) => m.piece.id === 'FRONT_UPPER')!;
    expect(front.artworkPanel).toBe('FRONT');
    const uv = front.geometry.getAttribute('uv') as BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getX(i)).toBeCloseTo(front.local[2 * i] / 150, 6);
      expect(uv.getY(i)).toBeCloseTo(front.local[2 * i + 1] / 250, 6);
    }
    // Strips continue the wall's UV space below the fold line (extend to bottom).
    const strip = meshes.find((m) => m.piece.id === 'RB_STRIP')!;
    expect(strip.artworkPanel).toBe('RIGHT');
    expect(Math.min(...Array.from(strip.geometry.getAttribute('uv').array).filter((_, i) => i % 2 === 1))).toBeCloseTo(-25 / 250, 6);
    expect(meshes.filter((m) => m.piece.link === 'GLUE').every((m) => m.artworkPanel === null)).toBe(true);
  });

  it('poses the flat sheet, the flat bag (layers ≤ 0.1 mm apart) and the open bag (mouth W × F)', () => {
    const meshes = createGussetedMeshes(dims, s);
    const all = (t: number) => {
      const frame = getGussetedFrame(dims, s, t);
      meshes.forEach((m) => updateGussetedMesh(m, frame));
      return meshes.flatMap((m) => Array.from((m.geometry.getAttribute('position') as BufferAttribute).array));
    };
    const sheet = all(0);
    expect(bounds(sheet, 2)).toEqual({ min: 0, max: 0 });
    // The sheet stands on the floor: the strip hangs from y = 0 (lift d).
    expect(bounds(sheet, 1).min).toBeCloseTo(0, 9);
    const flat = all(0.6);
    expect(bounds(flat, 2).max).toBeCloseTo(1.5 * GUSSETED_LAYER_STEP_MM * MM_TO_SCENE, 9);
    expect(bounds(flat, 2).min).toBeCloseTo(-5.5 * GUSSETED_LAYER_STEP_MM * MM_TO_SCENE, 9);
    expect(bounds(flat, 0).max).toBeCloseTo(75 * MM_TO_SCENE, 5);
    const open = all(1);
    expect(bounds(open, 2).max).toBeCloseTo((30 + 1.5 * GUSSETED_LAYER_STEP_MM) * MM_TO_SCENE, 4);
    for (const value of open) expect(Number.isFinite(value)).toBe(true);
  });

  it('writes the dieline cut and crease lines onto the facets for every pose', () => {
    const { edges, creases } = getGussetedLineSpecs(dims, s);
    expect(edges.length).toBeGreaterThan(10);
    // The gusset centres C4 are the only crease lines: one per facet part along x = F/2 of LEFT and RIGHT.
    expect(creases.every((c) => c.from[0] === 30 && c.to[0] === 30)).toBe(true);
    for (const t of [0, 0.3, 0.6, 1]) {
      const out = new Float32Array(edges.length * 6);
      writeGussetedLines(edges, getGussetedFrame(dims, s, t), out);
      for (const value of out) expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('fits the camera to the whole sheet B × L', () => {
    const extent = getGussetedSheetViewExtent(dims, s);
    expect(extent.radius).toBeCloseTo(0.5 * Math.hypot(2 * 150 + 2 * 60 + 15, 275), 9);
    expect(extent.centreY).toBeCloseTo(137.5, 9);
  });
});
