import { describe, expect, it } from 'vitest';
import { Box3, Vector3, type BufferAttribute } from 'three';
import { HANDLE_DEFAULTS } from '../domain/config/productCatalog';
import { getHandleLayout } from '../domain/geometry/handles';
import type { HandleType } from '../domain/types';
import { getBagFrame, getWallPlaneZ } from './bagGeometry';
import { MM_TO_SCENE, PAPER_LAYER_GAP_MM } from './constants';
import {
  createPatchGeometry,
  createRopeGeometry,
  createStripGeometry,
  createTwistTexture,
  getHandleWallPose,
  handleCentreOffset,
  handleStackThickness,
  patchOffset,
  PATCH_CLEARANCE_MM,
} from './handleGeometry';

const dims = { width: 200, height: 400, depth: 150 };
const s = MM_TO_SCENE;
const layoutOf = (type: HandleType) => getHandleLayout({ id: 'h', type, ...HANDLE_DEFAULTS[type] }, dims);

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
    expect(box.max.x).toBeCloseTo((layout.endSpacing / 2 + layout.footLength) * s, 3);
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
