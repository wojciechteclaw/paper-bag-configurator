import type { BufferAttribute } from 'three';
import { describe, expect, it } from 'vitest';
import { GUSSETED_BAG_RULES } from '../../src/domain/config/productCatalog';
import { MM_TO_SCENE } from '../../src/renderer/constants';
import {
  countSegments,
  createGussetedMeshes,
  getGussetedFrame,
  getGussetedLineSpecs,
  getWallRows,
  updateGussetedMesh,
  writeGussetedLines,
} from '../../src/renderer/gussetedBagGeometry';

const dims = { width: 200, height: 400, depth: 60 };
const b = GUSSETED_BAG_RULES.bottomFoldDepth;

function bounds(values: ArrayLike<number>, axis: number) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = axis; i < values.length; i += 3) {
    min = Math.min(min, values[i]);
    max = Math.max(max, values[i]);
  }
  return { min, max };
}

describe('gusseted-bag bag geometry', () => {
  it('creates one mesh per wall and per fold strip, with the shared panel UV basis', () => {
    const meshes = createGussetedMeshes(dims);
    expect(meshes.map((m) => m.id)).toEqual([
      'FRONT',
      'FRONT-STRIP',
      'RIGHT',
      'RIGHT-STRIP',
      'BACK',
      'BACK-STRIP',
      'LEFT',
      'LEFT-STRIP',
    ]);
    const front = meshes[0];
    const uv = front.geometry.getAttribute('uv') as BufferAttribute;
    front.samples.forEach(({ x, y }, i) => {
      expect(uv.getX(i)).toBeCloseTo(x / 200, 6);
      expect(uv.getY(i)).toBeCloseTo(y / 400, 6);
    });
    // The gusset grid has a column on its centre crease.
    expect(meshes[2].samples.some(({ x }) => x === 30)).toBe(true);
  });

  it('samples the opening zone densely and reaches the top edge', () => {
    const rows = getWallRows(dims);
    expect(rows[0]).toBe(0);
    expect(rows).toContain(b);
    expect(rows[rows.length - 1]).toBe(400);
    expect(rows.filter((y) => y > b && y < b + 60).length).toBeGreaterThanOrEqual(20);
  });

  it('poses the open bag W × D at the mouth and the flat bag within the layer gap', () => {
    const meshes = createGussetedMeshes(dims);
    const open = getGussetedFrame(dims, 0);
    const flat = getGussetedFrame(dims, 1);
    const back = meshes.find((m) => m.id === 'BACK')!;
    const right = meshes.find((m) => m.id === 'RIGHT')!;

    updateGussetedMesh(back, open);
    const openBack = (back.geometry.getAttribute('position') as BufferAttribute).array;
    expect(bounds(openBack, 2).min).toBeCloseTo(-30 * MM_TO_SCENE, 6);
    expect(bounds(openBack, 1)).toEqual({ min: 0, max: 400 * MM_TO_SCENE });
    updateGussetedMesh(right, open);
    expect(bounds((right.geometry.getAttribute('position') as BufferAttribute).array, 0).max).toBeCloseTo(100 * MM_TO_SCENE, 6);

    updateGussetedMesh(back, flat);
    const flatBack = (back.geometry.getAttribute('position') as BufferAttribute).array;
    expect(bounds(flatBack, 2).min).toBeGreaterThanOrEqual(-1 * MM_TO_SCENE);
    for (const value of flatBack) expect(Number.isFinite(value)).toBe(true);
    expect(back.geometry.getAttribute('normal')).toBeDefined();
  });

  it('writes every line segment of the edges and gusset creases', () => {
    const { edges, creases } = getGussetedLineSpecs(dims);
    expect(creases.map((c) => [c.panel, c.points[0].x])).toEqual([
      ['LEFT', 30],
      ['RIGHT', 30],
    ]);
    const out = new Float32Array(countSegments(edges) * 6);
    writeGussetedLines(edges, getGussetedFrame(dims, 0.5), out);
    for (const value of out) expect(Number.isFinite(value)).toBe(true);
    // The upper edge of the folded strip is FRONT's (outermost on the BACK side) at height b.
    const stripEdge = edges[edges.length - 1];
    expect(stripEdge.points.every((p) => p.y === -b)).toBe(true);
  });
});
