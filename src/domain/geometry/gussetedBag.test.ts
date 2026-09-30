import { describe, expect, it } from 'vitest';
import { BAG_TYPES, GUSSETED_BAG_RULES } from '../config/productCatalog';
import type { Dimensions } from '../types';
import {
  getBottomFoldDepth,
  getGussetAngle,
  getGussetedCutLength,
  getGussetedPanelBounds,
  getGussetedPoint,
  getGussetOpeningRise,
  getMouthDepth,
  getRecommendedGussetRange,
  getWallOffset,
  isGussetOutsideRecommended,
} from './gussetedBag';

const dims: Dimensions = { width: 200, height: 400, depth: 60 };
const b = GUSSETED_BAG_RULES.bottomFoldDepth;
const distance = (p: { x: number; y: number; z: number }, q: { x: number; y: number; z: number }) =>
  Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);

describe('gusseted-bag bag construction', () => {
  it('has a single fold-over bottom of b from the catalog and a cut length of H + b', () => {
    expect(getBottomFoldDepth(dims)).toBe(b);
    expect(getGussetedCutLength(dims)).toBe(400 + b);
    expect(getGussetedPanelBounds('LEFT', dims)).toEqual({ minX: 0, maxX: 60, minY: -b, maxY: 400 });
  });

  it('opens the gussets over min(D, H/2) above the bottom fold', () => {
    expect(getGussetOpeningRise(dims)).toBe(60);
    expect(getGussetOpeningRise({ height: 170, depth: 140 })).toBe(85);
  });

  it('uses the client bottom strip d = 25 mm within its 15–30 mm range', () => {
    expect(b).toBe(25);
    expect(b).toBeGreaterThanOrEqual(GUSSETED_BAG_RULES.bottomFoldRange.min);
    expect(b).toBeLessThanOrEqual(GUSSETED_BAG_RULES.bottomFoldRange.max);
    // The opening always fits: H_min ≥ d plus a positive opening zone.
    expect(BAG_TYPES.FOLDED.limits.height.min).toBeGreaterThan(b);
  });

  it('recommends a gusset of 0.4–0.7·W and flags anything outside', () => {
    expect(getRecommendedGussetRange(140).min).toBeCloseTo(56, 9);
    expect(getRecommendedGussetRange(140).max).toBeCloseTo(98, 9);
    expect(isGussetOutsideRecommended({ width: 140, depth: 90 })).toBe(false);
    expect(isGussetOutsideRecommended({ width: 140, depth: 55 })).toBe(true);
    expect(isGussetOutsideRecommended({ width: 140, depth: 100 })).toBe(true);
    expect(isGussetOutsideRecommended({ width: 140, depth: 98 })).toBe(false);
  });
});

describe('opening kinematics', () => {
  it('keeps the glued bottom fold flat and opens fully above the opening zone', () => {
    expect(getGussetAngle(dims, 0, 1)).toBe(0);
    expect(getGussetAngle(dims, b, 1)).toBe(0);
    expect(getGussetAngle(dims, b + 60, 1)).toBeCloseTo(Math.PI / 2, 12);
    expect(getGussetAngle(dims, 400, 1)).toBeCloseTo(Math.PI / 2, 12);
    expect(getGussetAngle(dims, 400, 0)).toBe(0);
    expect(getGussetAngle(dims, 400, 0.5)).toBeCloseTo(Math.PI / 4, 12);
  });

  it('rises monotonically from the bottom to the mouth', () => {
    let previous = -1;
    for (let y = 0; y <= 400; y += 5) {
      const angle = getGussetAngle(dims, y, 1);
      expect(angle).toBeGreaterThanOrEqual(previous);
      previous = angle;
    }
  });

  it('opens the mouth to W × D and folds it flat', () => {
    expect(getMouthDepth(dims, 1)).toBeCloseTo(60, 9);
    expect(getMouthDepth(dims, 0)).toBe(0);
    const top = (x: number, panel: 'FRONT' | 'RIGHT' | 'BACK' | 'LEFT', open: number) =>
      getGussetedPoint(dims, panel, { x, y: 400 }, open);
    // Open: FRONT at z = +D/2, BACK at −D/2, the gusset crease on the side edge (a flat side wall).
    expect(top(0, 'FRONT', 1)).toEqual({ x: -100, y: 400, z: 30 });
    expect(top(0, 'BACK', 1)).toEqual({ x: 100, y: 400, z: -30 });
    expect(top(30, 'RIGHT', 1).x).toBeCloseTo(100, 9);
    expect(top(30, 'RIGHT', 1).z).toBeCloseTo(0, 9);
    // Flat: everything in the centre plane, the crease D/2 inside the side edge.
    expect(top(30, 'RIGHT', 0)).toEqual({ x: 70, y: 400, z: 0 });
    expect(top(30, 'LEFT', 0)).toEqual({ x: -70, y: 400, z: 0 });
  });

  it('keeps the gusset halves D/2 wide in every state (the walls stay attached at the edges)', () => {
    for (const open of [0, 0.3, 1]) {
      for (const y of [0, 30, 50, 400]) {
        const edge = getGussetedPoint(dims, 'RIGHT', { x: 0, y }, open);
        const crease = getGussetedPoint(dims, 'RIGHT', { x: 30, y }, open);
        const back = getGussetedPoint(dims, 'RIGHT', { x: 60, y }, open);
        expect(distance(edge, crease)).toBeCloseTo(30, 9);
        expect(distance(crease, back)).toBeCloseTo(30, 9);
        // Shared edges: RIGHT x = 0 is FRONT x = W, RIGHT x = D is BACK x = 0; LEFT x = 0 is BACK x = W.
        expect(distance(edge, getGussetedPoint(dims, 'FRONT', { x: 200, y }, open))).toBeCloseTo(0, 9);
        expect(distance(back, getGussetedPoint(dims, 'BACK', { x: 0, y }, open))).toBeCloseTo(0, 9);
        expect(distance(getGussetedPoint(dims, 'LEFT', { x: 0, y }, open), getGussetedPoint(dims, 'BACK', { x: 200, y }, open))).toBeCloseTo(0, 9);
        expect(distance(getGussetedPoint(dims, 'LEFT', { x: 60, y }, open), getGussetedPoint(dims, 'FRONT', { x: 0, y }, open))).toBeCloseTo(0, 9);
      }
    }
  });

  it('separates flat layers by the render gap only where they are flat', () => {
    expect(getWallOffset(dims, 400, 0, 0.4)).toBeCloseTo(0.4, 12);
    expect(getWallOffset(dims, 400, 1, 0.4)).toBeCloseTo(30, 12);
  });
});

describe('fold-over bottom strip', () => {
  it('lies folded 180° onto the BACK [K] with the FRONT strip outermost', () => {
    const gap = 0.4;
    const back = getGussetedPoint(dims, 'BACK', { x: 50, y: -15 }, 1, gap);
    const front = getGussetedPoint(dims, 'FRONT', { x: 50, y: -15 }, 1, gap);
    const backWall = getGussetedPoint(dims, 'BACK', { x: 50, y: 15 }, 1, gap);
    // Mirrored up to y = 15; FRONT x runs from the LEFT edge, so its x = 50 is at world x = −50.
    expect(front).toEqual({ x: -50, y: 15, z: -4 * gap });
    expect(back.y).toBe(15);
    expect(back.z).toBeCloseTo(-2 * gap, 12);
    expect(backWall.z).toBeCloseTo(-gap, 12);
    expect(front.z).toBeLessThan(back.z);
    const gusset = getGussetedPoint(dims, 'RIGHT', { x: 30, y: -10 }, 1, gap);
    expect(gusset.z).toBeLessThan(back.z);
    expect(gusset.z).toBeGreaterThan(front.z);
  });
});
