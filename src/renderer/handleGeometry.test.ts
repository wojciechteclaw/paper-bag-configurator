import { describe, expect, it } from 'vitest';
import { Box3, Vector3, type BufferAttribute } from 'three';
import { HANDLE_DEFAULTS } from '../domain/config/productCatalog';
import { getHandleLayout } from '../domain/geometry/handles';
import { getStandingFoldProgress } from '../domain/geometry/foldKinematics';
import type { Dimensions, HandleType } from '../domain/types';
import { getBagFrame, getWallPlaneZ } from './bagGeometry';
import { MM_TO_SCENE, PAPER_LAYER_GAP_MM } from './constants';
import {
  createPatchGeometry,
  createPatchOutlinePoints,
  createPatchShadowGeometry,
  createRopeGeometry,
  createStripGeometry,
  createTwistTexture,
  getHandleWallPose,
  handleCentreOffset,
  handleHalfExtent,
  HANDLE_WALL_CLEARANCE_MM,
  handleStackThickness,
  patchOffset,
  PATCH_CLEARANCE_MM,
  PATCH_SHADOW,
} from './handleGeometry';

const dims = { width: 200, height: 400, depth: 150 };
const s = MM_TO_SCENE;
const layoutOf = (type: HandleType, d: Dimensions = dims) => getHandleLayout({ id: 'h', type, ...HANDLE_DEFAULTS[type] }, d);

describe('handle geometry', () => {
  it('builds the rope with the rope radius, from the ends under the patch up to the loop top', () => {
    const layout = layoutOf('TWISTED_PAPER');
    const { geometry, length } = createRopeGeometry(layout);
    const box = new Box3().setFromBufferAttribute(geometry.getAttribute('position') as BufferAttribute);
    const r = layout.params.width / 2;
    expect(box.max.y).toBeCloseTo((dims.height + layout.loopHeight + r) * s, 2);
    expect(box.min.y).toBeCloseTo(layout.endY * s, 3); // open tube end (hidden under the patch)
    expect(box.min.z).toBeGreaterThan(0); // never behind the inner wall surface
    expect(box.max.z).toBeCloseTo((handleCentreOffset(layout) + r) * s, 3);
    expect(length).toBeGreaterThan(layout.params.length);
    geometry.dispose();
  });

  it('builds the flat strip with its width in the wall plane', () => {
    const layout = layoutOf('FLAT_PAPER');
    const geometry = createStripGeometry(layout);
    const box = new Box3().setFromBufferAttribute(geometry.getAttribute('position') as BufferAttribute);
    const half = layout.params.width / 2;
    expect(box.max.y).toBeCloseTo((dims.height + layout.loopHeight + half) * s, 3);
    expect(box.max.x).toBeCloseTo((layout.endSpacing / 2 + half) * s, 3); // vertical legs, no feet
    expect(box.min.y).toBeCloseTo(layout.endY * s, 3);
    expect(box.min.z).toBeGreaterThan(0);
    expect(box.max.x).toBeLessThanOrEqual(layout.patch.x1 * s);
    geometry.dispose();
  });

  it.each(['TWISTED_PAPER', 'FLAT_PAPER'] as const)('%s patch covers the handle ends', (type) => {
    const layout = layoutOf(type);
    const geometry = createPatchGeometry(layout);
    const box = new Box3().setFromBufferAttribute(geometry.getAttribute('position') as BufferAttribute);
    expect(box.min.x).toBeCloseTo(layout.patch.x0 * s);
    expect(box.max.y).toBeCloseTo(layout.patch.y1 * s);
    expect(box.max.z).toBeCloseTo(handleStackThickness(layout) * s, 4);
    // Over a handle end the patch lies on top of the rope / strip.
    const a = layout.endSpacing / 2;
    const top = handleCentreOffset(layout) * 2;
    expect(patchOffset(layout, a, layout.patch.y1 - 1)).toBeGreaterThan(top);
    geometry.dispose();
  });

  it('lets the twisted patch hug the wall away from the rope', () => {
    const layout = layoutOf('TWISTED_PAPER');
    expect(patchOffset(layout, 0, layout.patch.y1 - 1)).toBeCloseTo(PATCH_CLEARANCE_MM);
  });

  it('creates a tileable twist texture', () => {
    const t = createTwistTexture(16);
    expect(t.image.width).toBe(16);
    t.dispose();
  });
});

describe('getHandleWallPose', () => {
  const stack = handleStackThickness(layoutOf('TWISTED_PAPER'));

  it('sits on FRONT (turned to face −Z) and on BACK, unsquashed, in the open bag', () => {
    const frame = getBagFrame(dims, 0);
    const front = getHandleWallPose(frame, 'FRONT', stack);
    const back = getHandleWallPose(frame, 'BACK', stack);
    expect(front).toEqual({ z: getWallPlaneZ(frame, 'FRONT'), rotationY: Math.PI, squash: 1 });
    expect(back.rotationY).toBe(0);
    expect(back.squash).toBe(1);
    expect(front.z - back.z).toBeCloseTo(dims.depth * s);
  });

  it.each([0, 0.25, 0.5, 0.75, 0.9, 0.97, 1])(
    'keeps the two handle stacks apart at p = %s (no intersection between the walls)',
    (p) => {
      const frame = getBagFrame(dims, p);
      const front = getHandleWallPose(frame, 'FRONT', stack);
      const back = getHandleWallPose(frame, 'BACK', stack);
      const frontInner = front.z - stack * front.squash * s;
      const backInner = back.z + stack * back.squash * s;
      expect(frontInner).toBeGreaterThanOrEqual(backInner - 1e-9);
    },
  );

  it('flattens the handles under the first paper layer when the bag is flat', () => {
    const frame = getBagFrame(dims, 1);
    const { squash } = getHandleWallPose(frame, 'FRONT', stack);
    expect(stack * squash).toBeLessThan(PAPER_LAYER_GAP_MM);
    expect(squash).toBeGreaterThan(0);
  });

  it('follows the BACK wall towards FRONT while folding', () => {
    const z = [0, 0.5, 1].map((p) => {
      const frame = getBagFrame(dims, p);
      return getHandleWallPose(frame, 'FRONT', stack).z - getHandleWallPose(frame, 'BACK', stack).z;
    });
    expect(z[0]).toBeGreaterThan(z[1]);
    expect(z[1]).toBeGreaterThan(z[2]);
    expect(z[2]).toBeCloseTo(4 * PAPER_LAYER_GAP_MM * s);
    expect(new Vector3(0, 0, z[2]).length()).toBeGreaterThan(0);
  });
});

describe('handles stay inside the bag (no bleed-through)', () => {
  const sizes: Dimensions[] = [
    { width: 75, height: 170, depth: 40 },
    { width: 100, height: 300, depth: 100 },
    { width: 200, height: 400, depth: 150 },
    { width: 260, height: 430, depth: 170 },
  ];
  const progresses = [0, getStandingFoldProgress(), 0.5, 0.75, 0.85, 0.9, 0.95, 0.97, 0.99, 1];

  /** All vertices of the handle and patch meshes in handle-local mm. */
  const verticesOf = (type: HandleType, d: Dimensions) => {
    const layout = layoutOf(type, d);
    const handle = type === 'TWISTED_PAPER' ? createRopeGeometry(layout).geometry : createStripGeometry(layout);
    const patch = createPatchGeometry(layout);
    const out: Vector3[] = [];
    for (const g of [handle, patch]) {
      const pos = g.getAttribute('position') as BufferAttribute;
      for (let i = 0; i < pos.count; i++) out.push(new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).divideScalar(s));
      g.dispose();
    }
    return { layout, vertices: out };
  };

  it('keeps the rope / strip and the patch at least 1 mm off the inner wall surface', () => {
    expect(HANDLE_WALL_CLEARANCE_MM).toBeGreaterThanOrEqual(1);
    expect(PATCH_CLEARANCE_MM).toBeGreaterThanOrEqual(1);
    const rope = layoutOf('TWISTED_PAPER');
    expect(handleCentreOffset(rope)).toBeGreaterThanOrEqual(1 + rope.params.width / 2);
  });

  for (const type of ['TWISTED_PAPER', 'FLAT_PAPER'] as const) {
    it.each(sizes)(`${type}: within the side walls in x in the open bag (%o)`, (d) => {
      const { vertices } = verticesOf(type, d);
      for (const v of vertices) expect(Math.abs(v.x)).toBeLessThan(d.width / 2);
    });

    it.each(sizes)(`${type}: on the inner side of FRONT / BACK and never through a gusset for p ∈ [0, 1] (%o)`, (d) => {
      const { layout, vertices } = verticesOf(type, d);
      const stack = handleStackThickness(layout);
      const halfExtent = handleHalfExtent(layout);
      for (const p of progresses) {
        const frame = getBagFrame(d, p);
        const { gap, sinTheta, cosTheta } = frame.pose;
        for (const wall of ['FRONT', 'BACK'] as const) {
          const { squash } = getHandleWallPose(frame, wall, stack, halfExtent);
          for (const v of vertices) {
            // Signed distance from the wall towards the bag interior (group z is scaled by squash), mm.
            const depth = v.z * squash;
            expect(depth).toBeGreaterThan(0);
            if (v.y >= d.height) continue; // loop above the top edge: no gusset there
            const fromEdge = d.width / 2 - Math.abs(v.x);
            const gusset = sinTheta > 1e-9 ? (fromEdge * cosTheta) / sinTheta : Infinity;
            // Room up to the gusset / mid-plane, plus the one-layer render push-back between wall and gusset.
            expect(depth).toBeLessThanOrEqual(Math.min(gap / 2, gusset) + frame.layerShift + 1e-6);
          }
        }
      }
    });
  }
});

describe('patch readability (outline + fake shadow, no shadow maps)', () => {
  it.each(['TWISTED_PAPER', 'FLAT_PAPER'] as const)('%s: outline is a closed loop on the patch corners, above its surface', (type) => {
    const layout = layoutOf(type);
    const pts = createPatchOutlinePoints(layout);
    expect(pts).toHaveLength(5);
    expect(pts[0]).toEqual(pts[4]);
    const { x0, x1, y0, y1 } = layout.patch;
    expect(pts.slice(0, 4).map(([x, y]) => [x / s, y / s])).toEqual([
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ].map(([x, y]) => [expect.closeTo(x, 6), expect.closeTo(y, 6)]));
    for (const [x, y, z] of pts) expect(z / s).toBeGreaterThan(patchOffset(layout, x / s, y / s));
  });

  it.each(['TWISTED_PAPER', 'FLAT_PAPER'] as const)('%s: shadow lies between wall and patch and is shifted down', (type) => {
    const layout = layoutOf(type);
    const box = new Box3().setFromBufferAttribute(createPatchShadowGeometry(layout).getAttribute('position') as BufferAttribute);
    expect(box.min.z / s).toBeGreaterThan(0);
    expect(box.max.z / s).toBeLessThan(HANDLE_WALL_CLEARANCE_MM);
    expect(box.min.y / s).toBeCloseTo(layout.patch.y0 - PATCH_SHADOW.spread - PATCH_SHADOW.drop, 3);
    // Nothing of the shadow shows above the patch's top edge.
    expect(box.max.y / s).toBeLessThanOrEqual(layout.patch.y1 + 1e-3);
  });
});
