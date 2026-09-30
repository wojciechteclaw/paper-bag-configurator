import { describe, expect, it } from 'vitest';
import { BAG_TYPES, GUSSETED_BAG_RULES } from '../../../src/domain/config/productCatalog';
import type { Dimensions } from '../../../src/domain/types';
import {
  getBottomFoldDepth,
  getGussetedCutLength,
  getGussetedPanelBounds,
  getRecommendedGussetRange,
  isGussetOutsideRecommended,
} from '../../../src/domain/geometry/gussetedBag';

// The forming / opening kinematics are tested in gussetedAssembly.test.ts.

const dims: Dimensions = { width: 200, height: 400, depth: 60 };
const b = GUSSETED_BAG_RULES.bottomFoldDepth;

describe('gusseted-bag bag construction', () => {
  it('has a single fold-over bottom of b from the catalog and a cut length of H + b', () => {
    expect(getBottomFoldDepth(dims)).toBe(b);
    expect(getGussetedCutLength(dims)).toBe(400 + b);
    expect(getGussetedPanelBounds('LEFT', dims)).toEqual({ minX: 0, maxX: 60, minY: -b, maxY: 400 });
  });

  it('takes the configured strip d and never more than H / 2', () => {
    expect(getBottomFoldDepth({ ...dims, bottomFold: 15 })).toBe(15);
    expect(getBottomFoldDepth({ height: 40, bottomFold: 30 })).toBe(20);
    expect(getBottomFoldDepth({ height: 400, bottomFold: Number.NaN })).toBe(0);
  });

  it('uses the client bottom strip d = 25 mm within its 15–30 mm range', () => {
    expect(b).toBe(25);
    expect(b).toBeGreaterThanOrEqual(GUSSETED_BAG_RULES.bottomFoldRange.min);
    expect(b).toBeLessThanOrEqual(GUSSETED_BAG_RULES.bottomFoldRange.max);
    // The opening always fits: H_min ≥ d plus a positive wall above the glued band.
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
